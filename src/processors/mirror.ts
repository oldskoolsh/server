import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorAptMirror extends BaseYamlProcessor {
    async process(src: any): Promise<any> {
        return src;
    }
}
