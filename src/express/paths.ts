/*
 * Copyright 2020-2021 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Express, Response} from "express";
import {BashScriptAsset} from "../assets/bash";
import {MimeTextFragment} from "../shared/mime";
import StatusCodes from 'http-status-codes';
import {OldSkoolMiddleware} from "./middleware";
import {RenderingContext} from "../repo/context";
import {LaunchersAsset} from "../assets/launchers";
import {IExecutableScript} from "../schema/results";
import {AssetFactory} from "../assets/asset_factory";
import {MetadataAsset, VendorDataAsset} from "../assets/metadata";
import {CloudConfigAsset, DropperAsset, GatherCloudConfigAsset, SubDropperAsset} from "../assets/cloudconfig";
import path from "path";

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
                let expandedResults = await context.getExpandedMergedResults();
                let minimalOsReleaseArchQS = await context.minimalOsReleaseArchQueryString();

                let body = "";
                body += "#include\n\n";

                // list final expanded recipes:
                body += `# Final expanded recipes:  ${expandedResults.recipes.map(value => value.id).join(", ")}\n`;
                // Show a compact view of installed apt sources and packages...
                body += `# Final packages: ${expandedResults.processedCloudConfig.packages}\n`;

                let sourcesCompact: String = expandedResults.processedCloudConfig.apt && expandedResults.processedCloudConfig.apt.sources ? Object.values(expandedResults.processedCloudConfig.apt.sources).map((one: any) => one.filename).join(', ') : "none";
                body += `# Final apt sources: ${sourcesCompact}\n`;
                //let mirrorsCompact: String = Object.values(expandedResults.processedCloudConfig.apt.primary).map((one: any) => one.uri).join(', ');
                //body += `# Final apt mirrors: ${mirrorsCompact}\n`;
                body += `\n`;

                // show all the messages.
                expandedResults.cloudConfig.messages?.forEach(value => {
                    body += `# <b>${value}</b>\n`;
                });
                body += `\n`;


                // comment to link to the cmdline version;
                body += `# for cmdline usage: \n#  curl --silent "${context.recipesUrlNoParams}/cmdline" | sudo bash\n\n`;
                body += `#  or if that fails: \n#  curl "${context.recipesUrlNoParams}/cmdline" | bash\n\n`;
                body += `#  kernel cmdline: \n#  ds=nocloud-net;s=${context.recipesUrlNoParams}/params/param1=value1/dsnocloud/\n\n`;

                // use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
                // that in turn brings in the to the yaml-merger in /real/cloud/init/yaml
                body += `# cloud-config to gather data; has fallback data in case gather fails.\n`
                body += `${context.recipesUrl}/cloud/init/yaml/data/gather` + "\n\n";

                // @TODO: move these to gather script.
                //        launchers specially!

                // link to the launcher-creators...
                // we only list the launchers here, as comments. all the actual heavy
                // lifting is done by /launchers with is an init-script!
                // consider: boot-cmd processor (DONE); cloud-init-per; etc.
                body += `# launchers: \n#  - ${expandedResults.launcherScripts.map((value: IExecutableScript) => `${value.callSign} (${context.moduleUrl}/${value.assetPath})`).join("\n#  - ")}\n`;
                body += `${context.recipesUrl}/launchers${minimalOsReleaseArchQS}\n\n`;

                body += `# bootscripts: \n#  - ${expandedResults.bootScripts.map((value: IExecutableScript) => `${value.callSign} (${context.moduleUrl}/${value.assetPath})`).join("\n#  - ")}\n\n`;

                // link to the init-scripts, directly.
                expandedResults.initScripts.forEach((script: IExecutableScript) => {
                    body += `# - initscript: ${script.callSign}\n`;
                    body += `${context.moduleUrl}/${script.assetPath}${minimalOsReleaseArchQS}\n\n`;
                });


                // Comments show the context variables at the time of rendering.
                body += `\n# All context variables:\n`;
                let allVars: Map<string, string> = await context.getAllVariables();
                allVars.forEach((value, key) => {
                    body += `#  ${key}: <b>${value}</b>\n`;
                });

                return new MimeTextFragment("text/x-include-url", "oldskool-main-include", body);
            });


        // asset renders; this does not specify recipes, but scripts can come up with their own, and "base"-like auto-includes work.
        this.handle(
            [`${this.uriOwnerRepoCommitish}/_/:path(*)`, `${this.uriNoCloudWithParams}/_/:path(*)`],
            async (context: RenderingContext, res: Response) => {
                let assetImpl = AssetFactory.createAssetByFileName(context, context.resolver, context.assetRenderPath);
                return await assetImpl.renderFromFile();
            });

        // This produces the YAML for #cloud-config, merged.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/real/cloud/init/yaml`,
                `${this.uriNoCloudWithoutParams}/real/cloud/init/yaml`,
                `${this.uriNoCloudWithParams}/real/cloud/init/yaml`],
            async (context: RenderingContext, res: Response) => {
                // merge and process.
                return await (new CloudConfigAsset(context, context.resolver, "real_oldskool_cloud_config")).renderFromObj();
            });

        // This produces the data-gatherer version of the cloud-config YAML;
        // it is produced using only the params present in the URL (it did not resolve jinja yet)
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cloud/init/yaml/data/gather`,
                `${this.uriNoCloudWithoutParams}/cloud/init/yaml/data/gather`,
                `${this.uriNoCloudWithParams}/cloud/init/yaml/data/gather`],
            async (context: RenderingContext, res: Response) => {
                return await (new GatherCloudConfigAsset(context, context.resolver, "gather_oldskool_cloud_config")).renderFromObj();
            });

        // This produces a "initscript" that creates launchers.
        // Also a "oldskool_launchers" script that re-runs itself.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/launchers`,
                `${this.uriNoCloudWithoutParams}/launchers`,
                `${this.uriNoCloudWithParams}/launchers`],
            async (context: RenderingContext, res: Response) => {
                return await (new LaunchersAsset(context, context.resolver, "oldskool-bundle")).renderFromFile();
            });

        // This is called by the gather yaml, to produce the actual dropper script.
        // It calls all the other URLs.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/dropper`,
                `${this.uriNoCloudWithoutParams}/dropper`,
                `${this.uriNoCloudWithParams}/dropper`],
            async (context: RenderingContext, res: Response) => {
                return await (new DropperAsset(context, context.resolver, "oldskool-dropper")).renderFromFile();
            });

        // Dropper (above) uses a subdropper for the initscripts. Long story. Go see for yourself.
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/subdropper`,
                `${this.uriNoCloudWithoutParams}/subdropper`,
                `${this.uriNoCloudWithParams}/subdropper`],
            async (context: RenderingContext, res: Response) => {
                return await (new SubDropperAsset(context, context.resolver, "oldskool-subdropper")).renderFromFile();
            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `## **INCLUDE:ci_launchers.sh\ncmdLineCloudInit "${context.recipesUrl}/"\n`;
                return await (new BashScriptAsset(context, context.resolver, "cmdline_starter")).renderFromString(bashTemplate);
            });

        // This produces a "initscript" that runs cloud-init on a preinstalled machine. dangerous?
        this.handle(
            [`${this.uriOwnerRepoCommitishRecipes}/cmdline/docker`],
            async (context: RenderingContext, res: Response) => {
                let bashTemplate = `## **INCLUDE:ci_launchers.sh\ncmdLineCloudInitDocker "${context.recipesUrl}/"\n`;
                return await (new BashScriptAsset(context, context.resolver, "cmdline_docker_starter")).renderFromString(bashTemplate);
            });


        // for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
        // we serve metadata so it does not complain; instance-id is required.
        this.handle(
            [`${this.uriNoCloudWithoutParams}/meta-data`,
                `${this.uriNoCloudWithParams}/meta-data`],
            async (context: RenderingContext, res: Response) => {
                return await (new MetadataAsset(context, context.resolver, "fake_nocloud_metadata")).renderFromString();
            });

        // recently it also started requesting "vendor-data", serve that as well.
        this.handle(
            [`${this.uriNoCloudWithoutParams}/vendor-data`,
                `${this.uriNoCloudWithParams}/vendor-data`],
            async (context: RenderingContext, res: Response) => {
                return await (new VendorDataAsset(context, context.resolver, "fake_vendor_Data")).renderFromString();
            });


        this.app.get('/schema', async (req, res, next) => {
            let schemaPath = path.join(__dirname, '..', '..', 'recipe.schema.json');
            console.log("Serving schema: ", schemaPath);
            res.sendFile(schemaPath, {headers: {'x-producer': 'oldskool', 'cache-control':'public, max-age=600'}});
        });


    }


}
