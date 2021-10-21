/*
 * Copyright 2020 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
