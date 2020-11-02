import {BaseYamlProcessor} from "./ci_processor";

export class CloudInitYamlProcessorSSHKeys extends BaseYamlProcessor {

    async process(): Promise<any> {
        return this.src;
    }

}
