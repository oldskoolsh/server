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

import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";

import fetch from "node-fetch";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";


export abstract class BaseYamlProcessor {
    protected context!: RenderingContext;
    protected repoResolver!: RepoResolver;

    prepare(context: RenderingContext, resolver: RepoResolver) {
        this.context = context;
        this.repoResolver = resolver;
    }

    abstract process(input: ExtendedCloudConfig): Promise<StandardCloudConfig>;

    async cached(cacheKey: string, ttl: number, producer: () => Promise<string>): Promise<string> {
        //await console.log("Getting from cache", cacheKey);

        let tedis = await this.context.tedisPool.getTedis();
        try {
            let value = await tedis.get(cacheKey);
            if (value) {
                //await console.log("HIT!");
                return <string>value;
            }
            //await console.log("MISS");
            value = await producer();
            await console.log("Writing to Redis after MISS:", cacheKey, "for", ttl, "seconds");
            await tedis.setex(cacheKey, ttl, <string>value);
            return value;
        } finally {
            await this.context.tedisPool.putTedis(tedis);
        }
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

