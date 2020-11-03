import {RenderingContext} from "../assets/context";
import {RepoResolver} from "../repo/resolver";

import fetch from "node-fetch";
import * as openpgp from 'openpgp'


export abstract class BaseYamlProcessor {
    protected context!: RenderingContext;
    protected repoResolver!: RepoResolver;

    prepare(context: RenderingContext, resolver: RepoResolver) {
        this.context = context;
        this.repoResolver = resolver;
    }

    abstract async process(input: any): Promise<any>;

    async cached(cacheKey: string, ttl: number, producer: () => Promise<string>): Promise<string> {
        //await console.log("Getting from cache", cacheKey);
        let value = await this.context.tedis.get(cacheKey);
        if (value) {
            //await console.log("HIT!");
            return <string>value;
        }
        //await console.log("MISS");
        value = await producer();
        await console.log("Writing to Redis after MISS:", cacheKey, "for", ttl, "seconds");
        await this.context.tedis.setex(cacheKey, ttl, <string>value);
        return value;
    }

    // returns a Buffer; in the cache it is stored as base64
    protected async cachedHTTPRequest(url: string, ttl: number): Promise<Buffer> {
        let httpContents = await this.cached(`http_${url}`, ttl, async () => {
            const response = await fetch(url);
            const buffer: Buffer = await response.buffer();
            return buffer.toString("base64");
        });
        let httpBuffer: Buffer = Buffer.from(httpContents, "base64")
        return httpBuffer;
    }


}

