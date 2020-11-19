import {Express, Response} from "express";
import {CloudInitProcessorStack} from "../processors/stack";
import YAML from "yaml";
import {BashScriptAsset} from "../assets/bash";
import {MimeTextFragment} from "../shared/mime";
import StatusCodes from 'http-status-codes';
import {OldSkoolMiddleware} from "./middleware";
import {RenderingContext} from "../repo/context";
import {IExecutableScript, RecipeExecutablesProcessor} from "../repo/scripts";
import {JSScriptAsset} from "../assets/js";
import {CloudInitExpanderMerger} from "../expander_merger/expandermerger";

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

                let merged = await (new CloudInitExpanderMerger(context, context.resolver, context.recipeNames)).process();
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
                let merged = await (new CloudInitExpanderMerger(context, context.resolver, context.recipeNames)).process();
                let yaml = await new CloudInitProcessorStack(context, context.resolver, merged).addDefaultStack().processObj();

                let curlDatas = [
                    `--data-urlencode "osg_ci_arch={{machine}}"`,
                    `--data-urlencode "osg_ci_os={{distro}}"`,
                    `--data-urlencode "osg_ci_release={{distro_release}}"`,
                    `--data-urlencode "osg_ci_cloud={{cloud_name}}"`,
                    `--data-urlencode "osg_ci_platform={{platform}}"`,
                    `--data-urlencode "osg_ci_az={{availability_zone}}"`,
                    `--data-urlencode "osg_ci_region={{region}}"`,
                    `--data-urlencode "osg_ci_iid={{instance_id}}"`,
                    `--data-urlencode "osg_ci_sys_plat={{system_platform}}"`,
                    `--data-urlencode "osg_ci_kernel={{kernel_release}}"`,
                    `--data-urlencode "osg_ci_iid={{instance_id}}"`,
                    `--data-urlencode "osg_os_arch=$(arch || true) "`,
                    `--data-urlencode "osg_os_ci_version=$(cloud-init --version || true)"`,
                    `--data-urlencode "osg_os_release_pairs=$(cat /etc/os-release | grep -e "_ID" -e "VERSION" -e "NAME" | grep -v -i -e "http" | sed -e 's/\\"//g' | tr "\\n" ";" || true) "`,
                    `--data-urlencode "osg_cpu_info=$(cat /proc/cpuinfo | grep -i -e model -e "^revision" | sort | uniq | head -3 | cut -d ":" -f 2 | xargs || true) "`,
                    `--data-urlencode "osg_cpu_serial=$(cat /proc/cpuinfo  | grep -e "^Serial" | cut -d ":" -f 2 | xargs || true) "`,
                    `--data-urlencode "osg_ip2_intf=$(ip route s | grep "^default" | cut -d " " -f 5 || true)"`,
                    `--data-urlencode "osg_ip2_addr=$(ip addr show dev $(ip route s | grep "^default" | cut -d " " -f 5 || true) scope global up | grep inet | tr -s " " | cut -d " " -f 3 | xargs || true)"`,
                    //`--data-urlencode ""`,
                ]

                // --http1.1 is unsupported on old versions

                let origBootCmds = yaml.bootcmd || [];
                origBootCmds.unshift(
                    `echo OldSkool initting from curl  --silent --show-error --user-agent "$(curl --version | head -1 || true); OldSkool-Gather/0.66.6; $(cloud-init --version || true)" --output "/var/lib/cloud/instance/cloud-config.txt" -G ${curlDatas.join(" ")} ${context.recipesUrl}/real/cloud/init/yaml`,
                    "cp /var/lib/cloud/instance/cloud-config.txt /var/lib/cloud/instance/cloud-config.txt.orig",
                    `sleep 2`,
                    `curl --silent --show-error --user-agent "$(curl --version | head -1 || true); OldSkool-Gather/0.66.6; $(cloud-init --version || true)" --output "/var/lib/cloud/instance/cloud-config.txt" -G ${curlDatas.join(" ")} "${context.recipesUrl}/real/cloud/init/yaml"`,
                    `sleep 2`,
                    "echo Done, continuing..."
                );
                yaml.bootcmd = origBootCmds;

                let body: string = "";
                body += `## template: jinja\n`;
                body += `#cloud-config\n`;
                body += YAML.stringify(yaml);
                res.status(OK).contentType("text/plain").send(body);
            });


        // This produces a "initscript" that creates launchers.
        // Also a "oldskool_launchers" script that re-runs itself.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/launchers`,
                `${this.uriNoCloudWithoutParams}/launchers`,
                `${this.uriNoCloudWithParams}/launchers`],
            async (context: RenderingContext, res: Response) => {
                let scriptsProcessor = await (new RecipeExecutablesProcessor(context)).process();

                let bashPrelude = `#!/bin/bash\n## **INCLUDE:bash_launchers.sh\n`;

                let launchersReinstall = `createLauncherRelauncher "${context.recipesUrl}/launchers"\n`;

                let bashTemplate: string =
                    scriptsProcessor.launcherDefs.map((value: IExecutableScript) => `createLauncherScript "${value.launcherName}" "${value.assetPath}"`).join("\n") +
                    `\n`;

                let jsTemplate: string = ""; // `## **INCLUDE:js_launchers.sh\n`;

                let allTemplates = bashPrelude + launchersReinstall + bashTemplate + `` + jsTemplate;
                let body = await (new BashScriptAsset(context, context.resolver, "oldskool-bundle")).renderFromString(allTemplates);
                res.status(OK).contentType("text/plain").send(body);

            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `#!/bin/bash\n## **INCLUDE:ci_launchers.sh\ncmdLineCloudInit "${context.recipesUrl}/"\n`;
                let body = await (new BashScriptAsset(context, context.resolver, "cmdline_starter")).renderFromString(bashTemplate);
                res.status(OK).contentType("text/plain").send(body);
            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline/docker`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `#!/bin/bash\n## **INCLUDE:ci_launchers.sh\ncmdLineCloudInitDocker "${context.recipesUrl}/"\n`;
                let body = await (new BashScriptAsset(context, context.resolver, "cmdline_docker_starter")).renderFromString(bashTemplate);
                res.status(OK).contentType("text/plain").send(body);
            });


        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        this.handle(
            [`${this.uriNoCloudWithoutParams}/meta-data`,
                `${this.uriNoCloudWithParams}/meta-data`],
            async (context: RenderingContext, res: Response) => {
                let cloud = context.getSomeParam(["cloud"]) || "nocloud";
                let instanceId = context.getSomeParam(["iid"]) || "i-87018aed";
                let hostNameFull = context.getSomeParam(["hostname"]) || (`${instanceId}.${cloud}`);
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
