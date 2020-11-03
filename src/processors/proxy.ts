import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorAptProxy extends BaseYamlProcessor {
    async process(src: any): Promise<any> {
        src.apt = src.apt || {};
        src.apt.proxy = "http://192.168.66.100:3128";
        return src;
    }
}
