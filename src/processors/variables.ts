import {BaseYamlProcessor} from "./base";
import {ExtendedCloudConfig, StandardCloudConfig} from "../expander_merger/expandermerger";

export class CloudInitYamlProcessorReplaceVariables extends BaseYamlProcessor {

    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        if (!src) throw new Error("null input");


        // Stringify and replace... what cloud be slower?
        let text = JSON.stringify(src);
        let allVars: Map<string, string> = await this.context.getAllVariables();

        allVars.forEach((value, key) => {
            text = text.replace(new RegExp(`\\[\\[${key}\\]\\]`, "gm"), value)
        })

        return JSON.parse(text);
    }

}
