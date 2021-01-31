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
        expandedResults.initScripts.forEach((script: IExecutableScript) => {
            partCounter++;
            functionCalls += `gatherInitScript "${this.context.moduleUrl}/${script.assetPath}" "${this.fillZeros(partCounter)}"\n`;
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
                return `${curlBin} --silent --show-error "${this.context.recipesUrl}/dropper?bash_force_color_logging=true" | ${bashBin} \n`;
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
