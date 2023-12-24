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

import {BaseAsset} from "./base_asset";
import {MimeTextFragment} from "../shared/mime";
import {ExpandMergeResults, IExecutableScript} from "../schema/results";
import YAML from "yaml";
import {StandardCloudConfig} from "../schema/cloud-init-schema";
import {BashScriptAsset} from "./bash";

export class DropperAsset extends BashScriptAsset {

    async renderFromFile(): Promise<MimeTextFragment> {
        let expandedResults = await this.context.getExpandedMergedResults();
        let functionCalls: string = "";
        functionCalls += "prepareGatherRun\n";
        functionCalls += `gatherCloudConfigYaml "${this.context.recipesUrl}/real/cloud/init/yaml"\n`;
        functionCalls += `gatherViaSubSource "${this.context.recipesUrl}/subdropper"\n`;
        functionCalls += "mainGatherRun\n";
        return await this.renderFromString("export OLDSKOOL_FORCE_COLOR_LOGGING=yes\n" + "## **INCLUDE:ci_gather.sh\n" + functionCalls);
    }

    protected fillZeros(partCounter: number) {
        return ("" + partCounter).padStart(3, "0");
    }
}


export class SubDropperAsset extends DropperAsset {

    async renderFromFile(): Promise<MimeTextFragment> {
        let expandedResults = await this.context.getExpandedMergedResults();
        let functionCalls: string = "";
        let partCounter = 2;
        functionCalls += `gatherInitScript "${this.context.recipesUrl}/launchers" "${this.fillZeros(partCounter)}"\n`;

        // Actually execute the launchers, so that bootscripts can use them.
        functionCalls += `"/var/lib/cloud/instance/scripts/part-${this.fillZeros(partCounter)}" || logError "Launcher exec failed!"\n`;

        expandedResults.initScripts.forEach((script: IExecutableScript) => {
            partCounter++;
            functionCalls += `gatherInitScript "${this.context.moduleUrl}/${script.assetPath}" "${this.fillZeros(partCounter)}"\n`;
        });

        // Now boot scripts...
        functionCalls += "prepareBootScriptsRun\n";
        expandedResults.bootScripts.forEach((script: IExecutableScript) => {
            functionCalls += `runBootScript "${this.context.moduleUrl}/${script.assetPath}" "${script.callSign}" \n`;
        });

        return await this.renderFromString(functionCalls);
    }
}

export class CloudConfigAsset extends BaseAsset {
    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        return await this.renderFromObj();
    }

    public async renderFromObj(): Promise<MimeTextFragment> {
        let finalResults: ExpandMergeResults = await this.context.getExpandedMergedResults();
        let body: string = "";
        body += `#cloud-config\n`;
        body += `# final recipes: ${finalResults.recipes.map(value => value.id).join(", ")} \n`;
        let cloudConfig: StandardCloudConfig = await this.processCloudConfig(finalResults.processedCloudConfig);
        body += YAML.stringify(cloudConfig);
        return new MimeTextFragment("text/cloud-config", this.assetPath, body);
    }

    protected async processCloudConfig(cloudConfig: StandardCloudConfig): Promise<StandardCloudConfig> {
        return cloudConfig;
    }
}

export class GatherCloudConfigAsset extends CloudConfigAsset {

    protected async processCloudConfig(cloudConfig: StandardCloudConfig): Promise<StandardCloudConfig> {
        // --http1.1 is unsupported on old curl versions!
        // @TODO: let possibleWgets: string[] = ["wget", "/usr/bin/wget", "/bin/wget", "/usr/local/bin/wget"];
        // @TODO: retries/timeouts

        let possibleCurls: string[] = ["curl"/*, "/usr/bin/curl", "/bin/curl", "/usr/local/bin/curl"*/].reverse();
        let possibleBashs: string[] = ["bash"/*, "/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"*/].reverse();

        // @TODO: this is run in sh ("dash" in Debian/Ubuntu) and I can't really figure out the fucking syntax
        let dropperCmds: string[] = possibleCurls.map(curlBin => {
            return possibleBashs.map(bashBin => {
                // --silent --show-error ?
                // --retry-all-errors requires a 7.71+ curl, but is very useful / insistent 
                return `echo "Oldskool loading ${this.context.recipesUrl}/dropper?bash_force_color_logging=true ..." >&2; ${curlBin} --retry 10 --retry-max-time 120 --retry-connrefused "${this.context.recipesUrl}/dropper?bash_force_color_logging=true" --output "/tmp/oldskool.dropper.sh" && ${bashBin} "/tmp/oldskool.dropper.sh"\n`;
            });
        }).flat();

        let origBootCmds = cloudConfig.bootcmd || [];
        origBootCmds.unshift(...dropperCmds);
        cloudConfig.bootcmd = origBootCmds;

        let origFinalMessage = cloudConfig.final_message || '';
        origFinalMessage = "[[OLDSKOOL! GATHER/DROPPER DID NOT WORK IF YOU SEE THIS]]\n" + origFinalMessage;
        cloudConfig.final_message = origFinalMessage;

        return cloudConfig;
    }
}
