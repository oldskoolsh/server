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

export class CloudInitYamlProcessorPackages extends BaseYamlProcessor {
    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        src.packages = src.packages || [];
        // if empty, add a placeholder 'cloud-init' package. this is to avoid newer cloud-init versions from crapping out with "Cloud config schema errors: packages: [] is too short"
        if (src.packages.length === 0) {
            src.packages.push("cloud-init");
        }

        let finalPackages = [];
        let packageSet = new Set<string>();
        for (const packageRef of src.packages) {
            let [packageName, packageVersion] = packageRef.split("=");
            if (!packageSet.has(packageName)) {
                finalPackages.push(packageVersion ? [packageName, packageVersion] : packageName);
                packageSet.add(packageName);
            } else {
                console.warn("Duplicated packageName", packageName);
            }
        }
        src.packages = finalPackages;
        return src;
    }
}
