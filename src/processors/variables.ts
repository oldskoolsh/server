import {BaseYamlProcessor} from "./base";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudInitYamlProcessorReplaceVariables extends BaseYamlProcessor {

    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        if (!src) throw new Error("null input");


        // Stringify and replace... what cloud be slower?
        let text = JSON.stringify(src);
        let allVars: Map<string, string> = await this.context.getAllVariables();

        allVars.forEach((value, key) => {
            text = text.replace(new RegExp(`\\[\\[${key}\\]\\]`, "gm"), value)
        })

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Invalid JSON produced: ", text)
            throw new Error(`CloudInitYamlProcessorReplaceVariables produced invalid JSON.`);
        }
    }

}
