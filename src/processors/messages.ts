import {BaseYamlProcessor} from "./base";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudInitYamlProcessorMessages extends BaseYamlProcessor {
    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        src.final_message = src.final_message || "";

        if (src.messages) {
            if (src.messages instanceof Array) {
                if (src.messages.length > 0) {
                    let msgs: string[] = [...src.messages];
                    src.final_message = msgs.map(value => `-> ${value}`).join("\n") + "\n" + src.final_message;
                }
            }
            delete src.messages;
        }
        return src;
    }
}
