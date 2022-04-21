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

import {TedisPool} from "tedis";
import logger from "../shared/Logger";
import {Express, NextFunction, Request, Response} from 'express';
import morgan from "morgan";
import bodyParser from "body-parser";

import hljs from 'highlight.js';
import StatusCodes from "http-status-codes";
import {RenderingContext} from "../repo/context";
import {GeoIpReaders} from "../shared/geoip";
import {Query} from "express-serve-static-core";
import {MimeTextFragment} from "../shared/mime";
import promBundle from "express-prom-bundle";

// Hack into Express to be able to catch exceptions thrown from async handlers.
// Yes, a "require" here is the only way to make this work.
import linkifyUrls from "linkify-urls";

const express = require('express');

require('express-async-errors');
const {BAD_REQUEST, OK} = StatusCodes;

export abstract class OldSkoolBase {
    protected readonly tedisPool: TedisPool;
    protected readonly geoipReaders: GeoIpReaders;
    protected readonly app: Express;

    constructor(tedisPool: TedisPool, geoIpReaders: GeoIpReaders) {
        this.tedisPool = tedisPool;
        this.app = express();
        this.geoipReaders = geoIpReaders;
    }

    handle(paths: string[], handler: (context: RenderingContext, res: Response, req: Request) => Promise<MimeTextFragment>) {
        for (const path of paths) {
            this.app.all(path, async (req, res, next) => {
                let ret: MimeTextFragment | void = await handler(req.oldSkoolContext, res, req);
                if (ret) {
                    await this.writeSingleFragmentToResponse(req.oldSkoolContext, res, req, ret);
                }
                next();
            });
        }
    }

    middleware(paths: string[], handler: (req: Request, res: Response) => Promise<void>) {
        for (const path of paths) {
            this.app.use(path, async (req, res, next) => {
                await handler(req, res);
                next();
            });
        }
    }

    async createAndListen() {
        let app = await this.createExpressServer();
        const port = Number(process.env.PORT || 3000);
        let bla = await app.listen(port, () => {
            logger.info(`Express server started on port: ${port}`);
        });
    }

    async createExpressServer() {
        // use strong etags... beware NGINX, which will downgrade to weak during gzip.
        this.app.set('etag', 'strong');

        //this.app.set('etag', function (body: any, encoding: any) {
        //    return null;
        //})

        // handle reverse proxy (X-Forwarded-For etc)
        this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

        this.app.use(bodyParser.urlencoded({extended: true}));

        // Show routes called in console during development
        // @ts-ignore // @TODO: what happened?
        this.app.use(morgan('combined'));

        // "Security headers"
        // import helmet from 'helmet';
        //app.use(helmet());

        // Add the options to the prometheus middleware most option are for http_request_duration_seconds histogram metric
        // add the prometheus middleware to all routes
        this.app.use(promBundle({
            includeMethod: true,
            includePath: true,
            includeStatusCode: true,
            includeUp: true,
            customLabels: {oldskool: 'server'},
            promClient: {
                collectDefaultMetrics: {}
            }
        }));

        // Print API errors
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.err(err, true);

            res.status(BAD_REQUEST).json({
                error: err.message,
            });

            next();
        });

        this.addEntranceMiddleware(this.app);
        this.addPathHandlers(this.app);
        this.addExitMiddleware(this.app);

        return this.app;
    }

    abstract addExitMiddleware(app: Express): void;

    abstract addPathHandlers(app: Express): void;

    abstract addEntranceMiddleware(app: Express): void;

    protected readParamsQS(req: Request) {
        let paramsQS: Map<string, string> = new Map<string, string>();
        let qsKey: string;
        let expressQS: Query = req.body ? req.body : req.query;
        let keys = Object.keys(expressQS);
        for (qsKey of keys) {
            let qsValue: string | string[] | Query | Query[] | undefined = expressQS[qsKey];
            if (qsValue === undefined) continue;
            if (qsValue instanceof Array) {
                let lastArrVal = qsValue[qsValue.length - 1]
                paramsQS.set(qsKey.toLowerCase(), lastArrVal.toString().toLowerCase());
            } else {
                paramsQS.set(qsKey.toLowerCase(), qsValue.toString().toLowerCase());
            }
        }
        console.log("Final paramsQS:", paramsQS);
        return paramsQS;
    }

    protected readParamKV(req: Request) {
        let paramStr: string = req.params.defaults || "";
        let strKeyValuePairs: string[] = paramStr.split(",");
        let keyValuesPairs: string[][] = strKeyValuePairs.map(value => value.split("=")).filter(value => value.length == 2);
        let parsedKeyVal: { value: string; key: string }[] = keyValuesPairs.map(value => ({
            key: value[0].toLowerCase(),
            value: value[1].toLowerCase()
        }));
        let keyValueMap: Map<string, string> = new Map<string, string>();
        parsedKeyVal.forEach(value => keyValueMap.set(value.key, value.value));
        return {paramStr, keyValueMap};
    }

    private async writeSingleFragmentToResponse(oldSkoolContext: RenderingContext, res: Response, req: Request, fragment: MimeTextFragment) {
        let ua = await oldSkoolContext.getUserAgent();
        if (ua.engine.name) {
            let title = fragment.filename;
            let highlightedCode: string = fragment.body;

            switch (fragment.type) {
                case "text/x-shellscript":
                    highlightedCode = hljs.highlight("bash", fragment.body).value;
                    break;

                case "text/cloud-config":
                case "text/yaml":
                    highlightedCode = hljs.highlight("yaml", fragment.body).value;
                    break;

                case "text/x-include-url":
                    highlightedCode = linkifyUrls(highlightedCode, {attributes: {target: '_blank'}});
                    break;

                default:
                    throw new Error("Don't know how to render " + fragment.type);
            }


            const html = `<html lang="en">
<head>
    <link rel="stylesheet" href="//cdnjs.cloudflare.com/ajax/libs/highlight.js/10.4.0/styles/default.min.css">
    <title>${title}</title></head>
<body>
<pre>${highlightedCode}</pre>
</body>
</html>`

            res.status(200)
                .contentType("text/html")
                .send(html);
        } else {
            // fuck express, order of calls is significant
            res.status(200).attachment(fragment.filename).type(fragment.type).send(fragment.body);
        }
    }

}
