import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorAptProxy extends BaseYamlProcessor {
    async process(src: any): Promise<any> {
        return src;
    }
}
