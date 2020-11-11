import {Express, Response} from "express";
import {CloudInitYamlMerger} from "../assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "../processors/stack";
import YAML from "yaml";
import {BashScriptAsset} from "../assets/bash";
import {MimeTextFragment} from "../shared/mime";
import StatusCodes from 'http-status-codes';
import {OldSkoolMiddleware} from "./middleware";
import {RenderingContext} from "../assets/context";
import {IExecutableScript, RecipeExecutablesProcessor} from "../repo/scripts";
import {JSScriptAsset} from "../assets/js";

const {BAD_REQUEST, OK} = StatusCodes;


export class OldSkoolServer extends OldSkoolMiddleware {

    addPathHandlers(app: Express) {

        // @TODO: this is NOT the root thing anymore, that is only owner/repo!
        // This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
        // for use with dsnocloud, user-data is the same as the main entrypoint
        // the same again as above, but with a placeholder for key=value pairs just like a querystring.
        this.handle(
            [
                `${this.uriOwnerRepoCommitishRecipes}`,
                `${this.uriNoCloudWithoutParams}/user-data`,
                `${this.uriNoCloudWithParams}/user-data`],
            async (context: RenderingContext, res: Response) => {
                let scriptsProcessor = await (new RecipeExecutablesProcessor(context)).process();

                let body = "";

                // body += "## template: jinja\n"; // mark this as a jinja template. it does not work directly with #include!
                body += "#include\n";

                // @TODO: explanations!

                // use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
                // that in turn brings in the to the yaml-merger in /real/cloud/init/yaml
                body += `${context.recipesUrl}/cloud/init/yaml/data/gather` + "\n";

                // link to the launcher-creators...
                // consider: boot-cmd processor; cloud-init-per; etc.
                body += `# bash launchers : ${scriptsProcessor.launcherDefs.map((value: IExecutableScript) => value.launcherName).join(", ")}\n`;
                body += `${context.recipesUrl}/launchers\n`;

                // link to the init-scripts, directly.
                scriptsProcessor.initScripts.forEach(script => {
                    body += `# initscript: ${script}\n`;
                    body += `${context.bashUrl}/${script}\n`;
                });

                // comment to link to the cmdline version;
                body += `# for cmdline usage: curl --silent "${context.recipesUrl}/cmdline" | sudo bash\n`;
                let fragment = new MimeTextFragment("text/x-include-url", "cloud-init-main-include.txt", body);
                res.status(200).contentType("text/plain").send(fragment.body);
            });


        // specific bash handler. this has no recipes!
        this.handle(
            [`${this.uriOwnerRepoCommitish}/bash/:path(*)`, `${this.uriNoCloudWithParams}/bash/:path(*)`],
            async (context: RenderingContext, res: Response) => {
                let body = await (new BashScriptAsset(context, context.resolver, context.assetRenderPath)).renderFromFile();
                res.status(OK).contentType("text/plain").send(body);
            });

        // specific js handler. this has no recipes!
        this.handle(
            [`${this.uriOwnerRepoCommitish}/js/:path(*)`, `${this.uriNoCloudWithParams}/js/:path(*)`],
            async (context: RenderingContext, res: Response) => {
                let body = await (new JSScriptAsset(context, context.resolver, context.assetRenderPath)).renderFromFile();
                res.status(OK).contentType("text/plain").send(body);
            });


        // This produces the YAML for #cloud-config, merged.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/real/cloud/init/yaml`,
                `${this.uriNoCloudWithoutParams}/real/cloud/init/yaml`,
                `${this.uriNoCloudWithParams}/real/cloud/init/yaml`],
            async (context: RenderingContext, res: Response) => {
                // merge and process.
                let merged = await (new CloudInitYamlMerger(context, context.resolver, context.recipes)).mergeYamls();
                let finalResult = await new CloudInitProcessorStack(context, context.resolver, merged).addDefaultStack().process();

                let body: string = "";
                body += `## template: jinja\n`;
                body += `#cloud-config\n`;
                body += `# final recipes: ${context.recipes.map(value => value.id).join(", ")} \n`;
                body += finalResult;
                res.status(OK).contentType("text/plain").send(body);
            });

        // This produces the data-gatherer version of the cloud-config YAML;
        // it is produced using only the params present in the URL (it did not resolve jinja yet)
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cloud/init/yaml/data/gather`,
                `${this.uriNoCloudWithoutParams}/cloud/init/yaml/data/gather`,
                `${this.uriNoCloudWithParams}/cloud/init/yaml/data/gather`],
            async (context: RenderingContext, res: Response) => {
                let merged = await (new CloudInitYamlMerger(context, context.resolver, context.recipes)).mergeYamls();
                let yaml = await new CloudInitProcessorStack(context, context.resolver, merged).addDefaultStack().processObj();

                let origBootCmds = yaml.bootcmd || [];
                origBootCmds.unshift(
                    `echo "OldSkool initting from ${context.recipesUrl}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}"`,
                    "cp /var/lib/cloud/instance/cloud-config.txt /var/lib/cloud/instance/cloud-config.txt.orig",
                    `echo @TODO: what if curl fails? Not mess up the cloud-config.`,
                    `curl "${context.recipesUrl}/real/cloud/init/yaml?ciarch={{machine}}&cicloud={{cloud_name}}&cios={{distro}}&cirelease={{distro_release}}&ciaz={{availability_zone}}&ciplatform={{platform}}&ciregion={{region}}" > /var/lib/cloud/instance/cloud-config.txt`,
                    `echo @TODO: update the scripts as well, possibly.`,
                    "echo Done, continuing..."
                );
                yaml.bootcmd = origBootCmds;

                let body: string = "";
                body += `## template: jinja\n`;
                body += `#cloud-config\n`;
                body += YAML.stringify(yaml);
                res.status(OK).contentType("text/plain").send(body);
            });


        // This produces a "initscript" that creates launchers @TODO: refactor
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/launchers`,
                `${this.uriNoCloudWithoutParams}/launchers`,
                `${this.uriNoCloudWithParams}/launchers`],
            async (context: RenderingContext, res: Response) => {
                let scriptsProcessor = await (new RecipeExecutablesProcessor(context)).process();

                // @TODO: bash_launcher.sh
                let bashPrelude = `#!/bin/bash\n## **INCLUDE:common.sh\n`;

                let bashTemplate: string =
                    scriptsProcessor.launcherDefs.map((value: IExecutableScript) => `createLauncherScript "${value.launcherName}" "${value.assetPath}"`).join("\n") +
                    `\n`;

                // @TODO: js_launcher.sh
                // add js-stuff, launcher
                let jsTemplate: string = "" //`## **INCLUDE:common.sh`;


                let allTemplates = bashPrelude + bashTemplate + `` + jsTemplate;
                let body = await (new BashScriptAsset(context, context.resolver, "oldskool-bundle")).renderFromString(allTemplates);
                res.status(OK).contentType("text/plain").send(body);

            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `#!/bin/bash\n## **INCLUDE:common.sh\ncmdLineCloudInit "${context.recipesUrl}/"\n`;
                let body = await (new BashScriptAsset(context, context.resolver, "cmdline_starter")).renderFromString(bashTemplate);
                res.status(OK).contentType("text/plain").send(body);
            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline/docker`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `#!/bin/bash\n## **INCLUDE:common.sh\ncmdLineCloudInitDocker "${context.recipesUrl}/"\n`;
                let body = await (new BashScriptAsset(context, context.resolver, "cmdline_docker_starter")).renderFromString(bashTemplate);
                res.status(OK).contentType("text/plain").send(body);
            });


        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        this.handle(
            [`${this.uriNoCloudWithoutParams}/meta-data`,
                `${this.uriNoCloudWithParams}/meta-data`],
            async (context: RenderingContext, res: Response) => {
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

                res.status(OK).contentType("text/yaml").send(YAML.stringify(metaData));
            });


    }

}
