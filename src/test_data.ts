import {RepoResolver} from "./repo/resolver";
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders, GeoIpReaders} from "./shared/geoip";
import {aff} from "./shared/utils";
import {test} from '@jest/globals';
import path from "path";
import fs from "fs";
import fg from "fast-glob";
import {RenderingContext} from "./repo/context";

new aff();


let tedisPool: TedisPool;
let resolver: RepoResolver;
let geoipReaders: GeoIpReaders;
let defaultBaseUrl: string;

beforeEach(async () => {
    // restore the original console.
    // @ts-ignore
    global.console = global.originalConsole;
})

beforeAll(async () => {
    defaultBaseUrl = "https://cloud-init.pardini.net/";
    geoipReaders = await (new DefaultGeoIPReaders()).prepareReaders();

    /*
        tedisPool = new TedisPool();

        resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
        await resolver.rootResolve();
    */
});

afterAll(async () => {
    //await tedisPool.release();
});

async function prepareFakeContextFromData(json: any): Promise<RenderingContext> {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.paramsQS = new Map<string, string>(Object.entries(json.paramsQS));
    context.paramKV = new Map<string, string>(Object.entries(json.paramsKV));
    context.clientIP = json.clientIP;
    context.userAgentStr = json.userAgentStr;
    await context.init();
    return context;
}

test(`test against datas`, async () => {
    let basePath = path.join(__dirname, "..", "data", "contexts");
    let files: string[] = await fg(`*.json`, {cwd: basePath});

    const allSkipUARegexes: RegExp[] = [/mozilla/i, /cloud/i];

    let allVars: object[] = [];
    for (const file of files) {
        let shortFileName = path.basename(file, ".json");

        // skip malformed JSON
        let json: any;
        try {
            json = JSON.parse(await fs.promises.readFile(path.join(basePath, file), "utf8"));
        } catch (e) {
            if (e instanceof SyntaxError) {
                console.error(`malformed JSON file: ${shortFileName}, err: ${e.message}`);
                continue;
            }
            throw e;
        }
        // skip browser tests
        if (json.userAgentStr && (allSkipUARegexes.some(value => json.userAgentStr.match(value)))) {
            //console.warn("Skip regex matched, bye");
            continue;
        }


        let ctx: RenderingContext = await prepareFakeContextFromData(json);


        let vars: { [p: string]: string } = Object.fromEntries(await ctx.getAllVariables());

        let extraInfo: { [p: string]: string } = {"file": shortFileName/*, "agent": json.userAgentStr*/};

        let result: { [p: string]: string } = Object.assign(extraInfo, vars);

        allVars.push(result);
    }

    console.table(allVars);


});

