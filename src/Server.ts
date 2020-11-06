import morgan from 'morgan';

import express, {NextFunction, Request, Response} from 'express';
import StatusCodes from 'http-status-codes';
import 'express-async-errors';

import logger from './shared/Logger';
import {Recipe} from "./repo/recipe";
import {CloudInitRecipeListExpander} from "./assets/ci_expander";
import {CloudInitYamlMerger} from "./assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "./processors/stack";
import {RepoResolver} from "./repo/resolver";
import {RenderingContext} from "./assets/context";
import YAML from 'yaml';
import {BashScriptAsset} from "./assets/bash";

import "./shared/utils";
import * as path from "path";
import {TedisPool} from "tedis";
import {MimeBundler, MimeTextFragment} from "./shared/mime";

export class OldSkoolServer {
    private readonly tedisPool: TedisPool;

    constructor(tedisPool: TedisPool) {
        this.tedisPool = tedisPool;
    }

    async createAndListen() {
        let app = await this.createExpressServer();
        const port = Number(process.env.PORT || 3000);
        let bla = await app.listen(port, () => {
            logger.info(`Express server started on port: ${port}`);
        });
    }


    async createExpressServer() {
        const app = express();
        const {BAD_REQUEST} = StatusCodes;

        //app.use(express.json());
        app.use(express.urlencoded({extended: true}));

        //app.use(cookieParser());

        // Show routes called in console during development
        app.use(morgan('dev'));

        // "Security headers"
        // import helmet from 'helmet';
        //app.use(helmet());

        // Print API errors
        app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.err(err, true);
            return res.status(BAD_REQUEST).json({
                error: err.message,
            });
        });


        // common middleware for specified ORC
        app.use("/:owner/:repo/:commitish", async (req, res, next) => {
            console.warn("Common middleware START!", req.params);
            // Fake, should come from :owner/:repo/:commitish
            const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
            await resolver.rootResolve();
            req.oldSkoolResolver = resolver;

            // also fake, should come from request datum
            let context = new RenderingContext("https://cloud-init.pardini.net/", this.tedisPool);
            context.moduleUrl = `${context.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
            await context.init();
            req.oldSkoolContext = context;

            next();
        })


        // This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
        app.get("/:owner/:repo/:commitish/:recipes", async (req, res, next) => {
            let main = await this.mainCloudConfigIncludeFragment(req);
            return res.status(200).contentType("text/plain").send(main.body);
            //return await (new MimeBundler([...await this.mainUserDataFragment(req)])).render(res);
        });

        // This produces the YAML for #cloud-config, merged.
        app.get("/:owner/:repo/:commitish/:recipes/real/cloud/init/yaml", async (req, res) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            // re-expand, although the main already expanded.
            let newList: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let merged = await (new CloudInitYamlMerger(req.oldSkoolContext, req.oldSkoolResolver, newList)).mergeYamls();
            // Processor stack processing
            let finalResult = await new CloudInitProcessorStack(req.oldSkoolContext, req.oldSkoolResolver, merged).addDefaultStack().process();

            let body: string = "";
            body += `## template: jinja\n`;
            body += `#cloud-config\n`;
            body += `# final recipes: ${newList.map(value => value.id).join(", ")} \n`;
            body += finalResult;

            return res.status(200).contentType("text/plain").send(body);
        });

        // This produces a minimal cloud-config that uses bootcmd to gather data and update the cloud-config in place
        app.get("/:owner/:repo/:commitish/:recipes/cloud/init/yaml/data/gather", async (req, res) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let finalRecipes = allRecipes.map(value => value.id);
            let yaml = {
                bootcmd: [`echo "OldSkool initting from ${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}"`,
                    "cp /var/lib/cloud/instance/cloud-config.txt /var/lib/cloud/instance/cloud-config.txt.orig",
                    `curl "${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}" > /var/lib/cloud/instance/cloud-config.txt`,
                    `echo @TODO: update the scripts as well, possibly.`,
                    "echo Done, continuing..."]
            };
            let body: string = "";
            body += `## template: jinja\n`;
            body += `#cloud-config\n`;
            body += YAML.stringify(yaml);
            return res.status(200).contentType("text/plain").send(body);
        });

        // This produces a "initscript" that creates launchers @TODO: refactor
        app.get("/:owner/:repo/:commitish/:recipes/launchers", async (req, res) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            // re-expand, although the main already expanded.
            let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let launcherScripts = await allRecipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));
            let launcherDefs = launcherScripts.map(value => {
                let parsed: path.ParsedPath = path.parse(value);
                let pathNoExt = `${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}`;
                let launcherName = parsed.name;
                return ({launcher: launcherName, script: pathNoExt});
            });

            let bashTemplate: string = `#!/bin/bash\n## **INCLUDE:common.sh\n` +
                launcherDefs.map(value => `createLauncherScript "${value.launcher}" "${value.script}"`).join("\n") +
                `\n`;

            let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, "launcher_template")).renderFromString(bashTemplate);
            return res.status(200).contentType("text/plain").send(body);
        });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        app.get("/:owner/:repo/:commitish/:recipes/cmdline", async (req, res) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            // re-expand, although the main already expanded.
            let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let finalRecipes = allRecipes.map(value => value.id);

            let bashTemplate: string = `#!/bin/bash\n## **INCLUDE:common.sh\n` +
                `cmdLineCloudInit "${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/"` +
                `\n`;

            let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, "launcher_template")).renderFromString(bashTemplate);
            return res.status(200).contentType("text/plain").send(body);
        });

        // bash renderer
        app.get("/:owner/:repo/:commitish/bash/:path(*)", async (req, res) => {
            console.log("asset path", req.params.path);
            let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, req.params.path)).renderFromFile();
            return res.status(200).contentType("text/plain").send(body);
        });

        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        app.get("/:owner/:repo/:commitish/:recipes/dsnocloud/meta-data", async (req, res) => {
            return res.status(200).contentType("text/yaml").send(YAML.stringify(this.createMetaDataMinimal()));
        });

        // the same again as above, put with a placeholder for key=value pairs just like a querystring.
        app.get("/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud/meta-data", async (req, res) => {
            console.warn(":defaults", req.params.defaults);
            return res.status(200).contentType("text/yaml").send(YAML.stringify(this.createMetaDataMinimal()));
        });

        // for use with dsnocloud, user-data is the same as the main entrypoint
        app.get("/:owner/:repo/:commitish/:recipes/dsnocloud/user-data", async (req, res) => {
            if (false) {
                let main = await this.mainCloudConfigIncludeFragment(req);
                return res.status(200).contentType("text/plain").send(main.body);
            } else {
                return await (new MimeBundler([...await this.mainUserDataFragment(req)])).render(res);
            }
        });

        // the same again as above, put with a placeholder for key=value pairs just like a querystring.
        app.get("/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud/user-data", async (req, res) => {
            console.warn(":defaults", req.params.defaults);
            if (false) {
                let main = await this.mainCloudConfigIncludeFragment(req);
                return res.status(200).contentType("text/plain").send(main.body);
            } else {
                return await (new MimeBundler([...await this.mainUserDataFragment(req)])).render(res);
            }
        });


        // common middleware for specified ORC; @TODO: I don't see this running ever
        app.use("/:owner/:repo/:commitish", async (req, res, next) => {
            console.warn("Common middleware END!", req.params);
            await req.oldSkoolContext.deinit();
            next();
        })

        return app;
    }

    async mainUserDataFragment(req: Request): Promise<MimeTextFragment[]> {
        return [await this.includePartHandler(req), await this.mainCloudConfigIncludeFragment(req)];
    }

    private async mainCloudConfigIncludeFragment(req: Request): Promise<MimeTextFragment> {
        // read recipes from request path
        let initialRecipes: string[] = req.params.recipes.split(",");
        let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
        let finalRecipes = allRecipes.map(value => value.id);

        let initScripts = await allRecipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_initscripts));
        let launcherScripts = await allRecipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));

        let body = "";

        // body += "## template: jinja\n"; // mark this as a jinja template. it does not work directly with #include!
        body += "#include\n";

        // @TODO: explanations!

        // use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
        // that in turn brings in the to the yaml-merger in /real/cloud/init/yaml
        body += `${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/cloud/init/yaml/data/gather` + "\n";

        // link to the launcher-creators...
        // consider: boot-cmd processor; cloud-init-per; etc.
        body += `# launchers : ${launcherScripts.join(", ")}\n`;
        body += `${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/launchers\n`;


        // link to the init-scripts, directly.
        initScripts.forEach(script => {
            body += `# initscript: ${script}\n`;
            body += `${req.oldSkoolContext.moduleUrl}/bash/${script}\n`;
        });

        // comment to link to the cmdline version;
        body += `# for cmdline usage: curl --silent "${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/cmdline" | sudo bash\n`;


        return new MimeTextFragment("text/x-include-url", "cloud-init-main-include.txt", body);
    }

    private createMetaDataMinimal() {
        let metaData: any = {};
        metaData["instance-id"] = "i-87018aed";
        metaData["hostname"] = "i-87018aed.fritz.box";
        return metaData;
    }

    private async includePartHandler(req: Request): Promise<MimeTextFragment> {
        let body: string = ``;
        body += `#part-handler
# vi: syntax=python ts=4
# this is an example of a version 2 part handler.
# the differences between the initial part-handler version
# and v2 is:
#  * handle_part receives a 5th argument, 'frequency'
#    frequency will be either 'always' or 'per-instance'
#  * handler_version must be set
#
# A handler declaring version 2 will be called on all instance boots, with a
# different 'frequency' argument.

handler_version = 2
def list_types():
    # return a list of mime-types that are handled by this module
    return(["text/templated-x-include-url"])

def handle_part(data,ctype,filename,payload,frequency):
    # data: the cloudinit object
    # ctype: '__begin__', '__end__', or the specific mime-type of the part
    # filename: the filename for the part, or dynamically generated part if
    #           no filename is given attribute is present
    # payload: the content of the part (empty for begin or end)
    # frequency: the frequency that this cloud-init run is running for
    #            this is either 'per-instance' or 'always'.  'per-instance'
    #            will be invoked only on the first boot.  'always' will
    #            will be called on subsequent boots.
    if ctype == "__begin__":
       print("my handler is beginning, frequency=%s" % frequency)
       return
    if ctype == "__end__":
       print("my handler is ending, frequency=%s" % frequency)
       return

    print("==== received ctype=%s filename=%s ====" % (ctype,filename))
    print(data)
    print(payload)
    print("==== end ctype=%s filename=%s" % (ctype, filename))
    `;
        //body += "---\n#cloud-config\nhostname: \"really.down.here\"\n";
        return new MimeTextFragment("text/part-handler", "xincluded.py", body);
        //return new MimeTextFragment("text/cloud-config", "another.yaml", body);
    }
}
