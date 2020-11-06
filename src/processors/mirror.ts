import {BaseYamlProcessor} from "./base";

export class CloudInitYamlProcessorAptMirror extends BaseYamlProcessor {
    async process(src: any): Promise<any> {
/*
        src.apt = src.apt || {};
        src.apt.primary = src.apt.primary || [];
        src.apt.primary[0] = src.apt.primary[0] || {};
        src.apt.primary[0].uri = "http://nl.archive.ubuntu.com/ubuntu/";
        src.apt.primary[0].arches = "default";
*/
        return src;
    }
}
