import morgan from 'morgan';
import helmet from 'helmet';

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
        app.use(helmet());

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
            let context = new RenderingContext("http://192.168.66.67:3000/", this.tedisPool);
            context.moduleUrl = `${context.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
            await context.init();
            req.oldSkoolContext = context;

            next();
        })


        async function mainUserData(req: Request, res: Response) {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let finalRecipes = allRecipes.map(value => value.id);

            let initScripts = await allRecipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_initscripts));
            let launcherScripts = await allRecipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));

            let body = "#include\n";

            // @TODO: explanations!

            // @TODO: possibly use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
            // link to the yaml-merger
            body += `${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/cloudinityaml` + "\n";

            // link to the launcher-creators...
            // consider: boot-cmd processor; cloud-init-per; etc.
            body += `# launchers : ${launcherScripts.join(", ")}\n`;
            body += `${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/launchers\n`;


            // link to the init-scripts, directly.
            initScripts.forEach(script => {
                body += `# initscript: ${script}\n`;
                body += `${req.oldSkoolContext.moduleUrl}/bash/${script}\n`;
            });

            return res.status(200).contentType("text/plain").send(body);
        }

        // This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
        app.get("/:owner/:repo/:commitish/:recipes", async (req, res, next) => {
            return await mainUserData(req, res);
        });

        // This produces the YAML for #cloud-config, merged.
        app.get("/:owner/:repo/:commitish/:recipes/cloudinityaml", async (req, res) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            // re-expand, although the main already expanded.
            let newList: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let merged = await (new CloudInitYamlMerger(req.oldSkoolContext, req.oldSkoolResolver, newList)).mergeYamls();
            // Processor stack processing
            let finalResult = await new CloudInitProcessorStack(req.oldSkoolContext, req.oldSkoolResolver, merged).addDefaultStack().process();

            let body: string = `#cloud-config\n`;
            body += `# final recipes: ${newList.map(value => value.id).join(", ")} \n`;
            body += finalResult;

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
            return await mainUserData(req, res);
        });

        // the same again as above, put with a placeholder for key=value pairs just like a querystring.
        app.get("/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud/user-data", async (req, res) => {
            console.warn(":defaults", req.params.defaults);
            return await mainUserData(req, res);
        });


        // common middleware for specified ORC;
        app.use("/:owner/:repo/:commitish", async (req, res, next) => {
            console.warn("Common middleware END!", req.params);
            await req.oldSkoolContext.deinit();
            next();
        })

        return app;
    }

    private createMetaDataMinimal() {
        let metaData: any = {};
        metaData["instance-id"] = "i-87018aed";
        return metaData;
    }
}
