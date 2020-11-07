import {Express, Response} from "express";
import {CloudInitYamlMerger} from "../assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "../processors/stack";
import YAML from "yaml";
import path from "path";
import {BashScriptAsset} from "../assets/bash";
import {MimeTextFragment} from "../shared/mime";
import StatusCodes from 'http-status-codes';
import {OldSkoolMiddleware} from "./middleware";
import {RenderingContext} from "../assets/context";

const {BAD_REQUEST, OK} = StatusCodes;


export class OldSkoolServer extends OldSkoolMiddleware {

    addPathHandlers(app: Express) {

        // This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
        // for use with dsnocloud, user-data is the same as the main entrypoint
        // the same again as above, but with a placeholder for key=value pairs just like a querystring.
        this.handle(
            [
                `${this.uriOwnerRepoCommitishRecipes}`,
                `${this.uriNoCloudWithoutParams}/user-data`,
                `${this.uriNoCloudWithParams}/user-data`],
            async (context: RenderingContext, res: Response) => {

                let initScripts = await context.recipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_initscripts));
                let launcherScripts = await context.recipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));

                let body = "";

                // body += "## template: jinja\n"; // mark this as a jinja template. it does not work directly with #include!
                body += "#include\n";

                // @TODO: explanations!

                // use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
                // that in turn brings in the to the yaml-merger in /real/cloud/init/yaml
                body += `${context.recipesUrl}/cloud/init/yaml/data/gather` + "\n";

                // link to the launcher-creators...
                // consider: boot-cmd processor; cloud-init-per; etc.
                body += `# launchers : ${launcherScripts.join(", ")}\n`;
                body += `${context.recipesUrl}/launchers\n`;

                // link to the init-scripts, directly.
                initScripts.forEach(script => {
                    body += `# initscript: ${script}\n`;
                    body += `${context.moduleUrl}/bash/${script}\n`;
                });

                // comment to link to the cmdline version;
                body += `# for cmdline usage: curl --silent "${context.recipesUrl}/cmdline" | sudo bash\n`;
                let fragment = new MimeTextFragment("text/x-include-url", "cloud-init-main-include.txt", body);
                res.status(200).contentType("text/plain").send(fragment.body);
            });


        // specific bash handler. this has no recipes!
        this.handle([`${this.uriOwnerRepoCommitish}/bash/:path(*)`], async (context: RenderingContext, res: Response) => {
            let body = await (new BashScriptAsset(context, context.resolver, context.assetRenderPath)).renderFromFile();
            res.status(200).contentType("text/plain").send(body);
        });


        // This produces the YAML for #cloud-config, merged.
        this.handle([`${this.uriOwnerRepoCommitishRecipes}/real/cloud/init/yaml`], async (context: RenderingContext, res: Response) => {
            // merge and process.
            let merged = await (new CloudInitYamlMerger(context, context.resolver, context.recipes)).mergeYamls();
            let finalResult = await new CloudInitProcessorStack(context, context.resolver, merged).addDefaultStack().process();

            let body: string = "";
            body += `## template: jinja\n`;
            body += `#cloud-config\n`;
            body += `# final recipes: ${context.recipes.map(value => value.id).join(", ")} \n`;
            body += finalResult;
            res.status(200).contentType("text/plain").send(body);
        });

        // This produces a minimal cloud-config that uses bootcmd to gather data and update the cloud-config in place
        this.handle([`${this.uriOwnerRepoCommitishRecipes}/cloud/init/yaml/data/gather`], async (context: RenderingContext, res: Response) => {
            let finalRecipes = context.recipes.map(value => value.id);
            let yaml = {
                bootcmd: [`echo "OldSkool initting from ${context.moduleUrl}/${finalRecipes.join(',')}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}"`,
                    "cp /var/lib/cloud/instance/cloud-config.txt /var/lib/cloud/instance/cloud-config.txt.orig",
                    `curl "${context.moduleUrl}/${finalRecipes.join(',')}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}" > /var/lib/cloud/instance/cloud-config.txt`,
                    `echo @TODO: update the scripts as well, possibly.`,
                    "echo Done, continuing..."]
            };
            let body: string = "";
            body += `## template: jinja\n`;
            body += `#cloud-config\n`;
            body += YAML.stringify(yaml);
            res.status(200).contentType("text/plain").send(body);
        });


        // This produces a "initscript" that creates launchers @TODO: refactor
        this.handle([`${this.uriOwnerRepoCommitishRecipes}/launchers`], async (context: RenderingContext, res: Response) => {
            let launcherScripts = await context.recipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));
            let launcherDefs = launcherScripts.map(value => {
                let parsed: path.ParsedPath = path.parse(value);
                let pathNoExt = `${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}`;
                let launcherName = parsed.name;
                return ({launcher: launcherName, script: pathNoExt});
            });

            let bashTemplate: string = `#!/bin/bash\n## **INCLUDE:common.sh\n` +
                launcherDefs.map(value => `createLauncherScript "${value.launcher}" "${value.script}"`).join("\n") +
                `\n`;

            let body = await (new BashScriptAsset(context, context.resolver, "launcher_template")).renderFromString(bashTemplate);
            res.status(200).contentType("text/plain").send(body);

        });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle([`${this.uriOwnerRepoCommitishRecipes}/cmdline`], async (context: RenderingContext, res: Response) => {
            let finalRecipes = context.recipes.map(value => value.id);

            let bashTemplate: string = `#!/bin/bash\n## **INCLUDE:common.sh\n` +
                `cmdLineCloudInit "${context.moduleUrl}/${finalRecipes.join(',')}/"` +
                `\n`;

            let body = await (new BashScriptAsset(context, context.resolver, "launcher_template")).renderFromString(bashTemplate);
            res.status(200).contentType("text/plain").send(body);
        });


        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        this.handle([`${this.uriNoCloudWithoutParams}/meta-data`, `${this.uriNoCloudWithParams}/meta-data`], async (context: RenderingContext, res: Response) => {
            let cloud = context.paramKV.get("cloud") || "noncloud";
            let instanceId = context.paramKV.get("iid") || "i-87018aed";
            let hostNameFull = context.paramKV.get("hostname") || (`${instanceId}.${cloud}`);
            hostNameFull = hostNameFull.includes(".") ? hostNameFull : `${hostNameFull}.default.domain`;

            let metaData: any = {};
            metaData["cloud"] = `oldskool-${cloud}`; // I don't think this is read anywhere.
            metaData["instance-id"] = instanceId;
            metaData["hostname"] = hostNameFull;
            metaData["local_hostname"] = hostNameFull;
            metaData["availability_zone"] = `${cloud}0`;
            metaData["region"] = `${cloud}`;
            metaData["oldskool"] = context.paramKV;

            res.status(200).contentType("text/yaml").send(YAML.stringify(metaData));
        });


    }

}
