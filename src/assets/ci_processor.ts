import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";

import fetch from "node-fetch";
import * as openpgp from 'openpgp'


export class BaseYamlProcessor {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly src: any;

    constructor(context: RenderingContext, resolver: RepoResolver, srcYaml: any) {
        this.context = context;
        this.repoResolver = resolver;
        this.src = srcYaml;
    }

    async cached(cacheKey: string, ttl: number, producer: () => Promise<string>): Promise<string> {
        try {
            await console.log("Getting from cache", cacheKey);
            let value = await this.context.tedis.get(cacheKey);
            if (value) {
                await console.log("HIT!");
                return <string>value;
            }
            await console.log("MISS");
            value = await producer();
            await console.log("Writing to Redis");
            await this.context.tedis.setex(cacheKey, ttl, <string>value);
            return value;
        } finally {
        }
    }

    protected async cachedHTTPRequest(url: string, ttl: number) {
        let httpContents = await this.cached(`http_${url}`, ttl, async () => {
            const response = await fetch(url);
            const buffer: Buffer = await response.buffer();
            return buffer.toString("base64");
        });
        await console.log("httpContents", httpContents);
        let httpBuffer: Buffer = Buffer.from(httpContents, "base64")
        return httpBuffer;
    }

    protected firstKeyArmored(result: openpgp.key.KeyResult): string {
        return result.keys[0].armor().replace(/\r/g, ""); // for some reason armor includes \r and comments which I hate.
    }


}

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
