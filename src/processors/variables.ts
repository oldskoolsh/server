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

export class CloudInitYamlProcessorReplaceVariables extends BaseYamlProcessor {

    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        if (!src) throw new Error("null input");


        // Stringify and replace... what cloud be slower?
        let originalJSON: String;
        let text = originalJSON = JSON.stringify(src);
        let allVars: Map<string, string> = await this.context.getAllVariables();

        allVars.forEach((value, key) => {
            text = text.replace(new RegExp(`\\[\\[${key}\\]\\]`, "gm"), value)
        })

        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("Invalid JSON produced: ", text)
            console.error("JSON before processing: ", originalJSON)
            throw new Error(`CloudInitYamlProcessorReplaceVariables produced invalid JSON.`);
        }
    }

}
