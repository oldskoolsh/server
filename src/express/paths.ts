import {Express, Request} from "express";
import {Recipe} from "../repo/recipe";
import {CloudInitRecipeListExpander} from "../assets/ci_expander";
import {CloudInitYamlMerger} from "../assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "../processors/stack";
import YAML from "yaml";
import path from "path";
import {BashScriptAsset} from "../assets/bash";
import {MimeTextFragment} from "../shared/mime";
import StatusCodes from 'http-status-codes';
import {OldSkoolMiddleware} from "./middleware";

const {BAD_REQUEST, OK} = StatusCodes;

export class OldSkoolServer extends OldSkoolMiddleware {

    addPathHandlers(app: Express) {
        // This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
        app.get(`${this.uriOwnerRepoCommitish}/:recipes`, async (req, res, next) => {
            let main = await this.mainCloudConfigIncludeFragment(req);
            res.status(200).contentType("text/plain").send(main.body);
            next();
        });

        // This produces the YAML for #cloud-config, merged.
        app.get(`${this.uriOwnerRepoCommitishRecipes}/real/cloud/init/yaml`, async (req, res, next) => {
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

            res.status(200).contentType("text/plain").send(body);
            next();
        });

        // This produces a minimal cloud-config that uses bootcmd to gather data and update the cloud-config in place
        app.get(`${this.uriOwnerRepoCommitishRecipes}/cloud/init/yaml/data/gather`, async (req, res, next) => {
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
            res.status(200).contentType("text/plain").send(body);
            next();
        });

        // This produces a "initscript" that creates launchers @TODO: refactor
        app.get(`${this.uriOwnerRepoCommitishRecipes}/launchers`, async (req, res, next) => {
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
            res.status(200).contentType("text/plain").send(body);
            next();
        });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        app.get(`${this.uriOwnerRepoCommitishRecipes}/cmdline`, async (req, res, next) => {
            // read recipes from request path
            let initialRecipes: string[] = req.params.recipes.split(",");
            // re-expand, although the main already expanded.
            let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            let finalRecipes = allRecipes.map(value => value.id);

            let bashTemplate: string = `#!/bin/bash\n## **INCLUDE:common.sh\n` +
                `cmdLineCloudInit "${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/"` +
                `\n`;

            let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, "launcher_template")).renderFromString(bashTemplate);
            res.status(200).contentType("text/plain").send(body);
            next();
        });

        // bash renderer
        app.get(`${this.uriOwnerRepoCommitish}/bash/:path(*)`, async (req, res, next) => {
            //console.log("asset path", req.params.path);
            let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, req.params.path)).renderFromFile();
            res.status(200).contentType("text/plain").send(body);
            next();
        });


        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        app.get(`${this.uriNoCloudWithoutParams}/meta-data`, async (req, res, next) => {
            res.status(200).contentType("text/yaml").send(YAML.stringify(this.createMetaDataMinimal(req)));
            next();
        });

        // the same again as above, put with a placeholder for key=value pairs just like a querystring.
        app.get(`${this.uriNoCloudWithParams}/meta-data`, async (req, res, next) => {
            res.status(200).contentType("text/yaml").send(YAML.stringify(this.createMetaDataMinimal(req)));
            next();
        });

        // for use with dsnocloud, user-data is the same as the main entrypoint
        app.get(`${this.uriNoCloudWithoutParams}/user-data`, async (req, res, next) => {
            let main = await this.mainCloudConfigIncludeFragment(req);
            res.status(200).contentType("text/plain").send(main.body);
            next();
        });

        // the same again as above, but with a placeholder for key=value pairs just like a querystring.
        app.get(`${this.uriNoCloudWithParams}/user-data`, async (req, res, next) => {
            let main = await this.mainCloudConfigIncludeFragment(req);
            res.status(200).contentType("text/plain").send(main.body);
            next();
        });
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

    private createMetaDataMinimal(req: Request) {
        // For oldskool-supported non-clouds (libvirt, hyperkit, hyperv, virtualbox)
        // the correspondent VM-creator script uses the /params/ URL variation.
        // that might include hints for the meta-data generator.

        let paramStr: string = req.params.defaults || "";
        let strKeyValuePairs: string[] = paramStr.split(",");
        let keyValuesPairs: string[][] = strKeyValuePairs.map(value => value.split("=")).filter(value => value.length == 2);
        let parsedKeyVal: { value: string; key: string }[] = keyValuesPairs.map(value => ({
            key: value[0],
            value: value[1]
        }));
        let keyValueMap: Map<string, string> = new Map<string, string>();
        parsedKeyVal.forEach(value => keyValueMap.set(value.key, value.value));

        // from create.sh
        // iid=${INSTANCE_ID},cloud=libvirt,arch=${ARCH},hostname=${NEWVM},tz=${TIMEZONE},os=ubuntu,release=${UBUNTUVERSION}

        let cloud = keyValueMap.get("cloud") || "noncloud";
        let instanceId = keyValueMap.get("iid") || "i-87018aed";
        let hostNameFull = keyValueMap.get("hostname") || (`${instanceId}.${cloud}`);
        hostNameFull = hostNameFull.includes(".") ? hostNameFull : `${hostNameFull}.default.domain`;

        let metaData: any = {};
        metaData["cloud"] = `oldskool-${cloud}`; // I don't think this is read anywhere.
        metaData["instance-id"] = instanceId;
        metaData["hostname"] = hostNameFull;
        metaData["local_hostname"] = hostNameFull;
        metaData["availability_zone"] = `${cloud}0`;
        metaData["region"] = `${cloud}`;
        metaData["oldskool"] = keyValueMap;
        return metaData;
    }

}
