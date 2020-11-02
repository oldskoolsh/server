import {RenderingContext} from "../assets/context";
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

