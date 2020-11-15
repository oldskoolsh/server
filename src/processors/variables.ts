import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorReplaceVariables extends BaseYamlProcessor {

    async process(src: any): Promise<any> {
        return src;
    }

}
