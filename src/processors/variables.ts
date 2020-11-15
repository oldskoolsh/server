import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorReplaceVariables extends BaseYamlProcessor {

    async process(src: any): Promise<any> {
        // Stringify and replace... what cloud be slower?

        let text = JSON.stringify(src);
        let allVars: Map<string, string> = await this.context.getAllVariables();

        allVars.forEach((value, key) => {
            text = text.replace(new RegExp(`\\[\\[${key}\\]\\]`, "gm"), value)
        })

        return JSON.parse(text);
    }

}
