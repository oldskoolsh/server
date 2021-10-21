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

import * as openpgp from "openpgp";
import {BaseYamlProcessor} from "./base";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudInitYamlProcessorAptSources extends BaseYamlProcessor {
    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        if (!src["apt_sources"]) return src;
        // store, and remove from return
        let orig_sources = src["apt_sources"];
        let handled = await Promise.all(orig_sources.map((value: any) => this.handleAptSource(value)));

        if (handled.length > 0) {
            src["apt"] = src["apt"] || {};
            src["apt"]["sources"] = src["apt"]["sources"] || {};
            let counter = 1;
            for (let handledSource of handled) {
                src["apt"]["sources"][`source_${counter++}`] = handledSource;
            }
        }

        delete src["apt_sources"];
        return src;
    }

    protected firstKeyArmored(result: openpgp.key.KeyResult): string {
        return result.keys[0].armor().replace(/\r/g, ""); // for some reason armor includes \r and comments which I hate.
    }

    private async handleAptSource(sourceDef: any): Promise<any> {
        if (sourceDef["http_key"]) {
            sourceDef["key"] = await this.resolveHttpKey(sourceDef["http_key"]);
            delete sourceDef["http_key"];
        }

        if (sourceDef["keyid"]) {
            sourceDef["key"] = await this.resolveKeyId(sourceDef["keyid"], sourceDef["keyserver"] ? sourceDef["keyserver"] : "keyserver.ubuntu.com");
            delete sourceDef["keyid"];
        }

        return sourceDef;
    }

    private async resolveHttpKey(httpKey: string): Promise<string> {
        return await this.cached(`gpg_${httpKey}`, 3600, async () => {
            let httpBuffer = await this.cachedHTTPRequest(httpKey, 3600 - 10);
            let result: openpgp.key.KeyResult;
            try {
                result = await openpgp.key.readArmored(httpBuffer.toString('utf8'));
                if (result.err) throw new Error("Error reading GPG armored " + result.err.join(", "));
            } catch (err) {
                result = await openpgp.key.read(httpBuffer);
                if (result.err) throw new Error("Error reading GPG NON-armored " + result.err.join(", "));
            }
            return this.firstKeyArmored(result);
        });
    }

    private async resolveKeyId(gpgKeyId: string, gpgServer: string): Promise<string> {
        return await this.cached(`${gpgKeyId}${gpgServer}`, 3600, async () => {
            const hkp = new openpgp.HKP(`https://${gpgServer}`);
            // @ts-ignore because hkp.lookup is wrongly mapped!
            let publicKeyArmored: String = await hkp.lookup({keyId: gpgKeyId});
            let result = await openpgp.key.readArmored(publicKeyArmored);
            return this.firstKeyArmored(result);
        });
    }

}
