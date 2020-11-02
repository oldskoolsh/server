import * as openpgp from "openpgp";
import {BaseYamlProcessor} from "./ci_processor";

export class CloudInitYamlProcessorAptSources extends BaseYamlProcessor {
    async process(): Promise<any> {
        if (!this.src["apt_sources"]) return this.src;
        // store, and remove from return
        let orig_sources = this.src["apt_sources"];
        let handled = await Promise.all(orig_sources.map((value: any) => this.handleAptSource(value)));

        if (handled.length > 0) {
            this.src["apt"] = this.src["apt"] || {};
            this.src["apt"]["sources"] = this.src["apt"]["sources"] || {};
            let counter = 1;
            for (let handledSource of handled) {
                this.src["apt"]["sources"][`source_${counter++}`] = handledSource;
            }
        }

        delete this.src["apt_sources"];
        return this.src;
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
