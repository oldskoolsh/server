import {RepoResolver} from "./repo/resolver";
import {RenderingContext} from "./repo/context";
import YAML from 'yaml';
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders, GeoIpReaders} from "./shared/geoip";
import {CloudInitExpanderMerger} from "./expander_merger/expandermerger";
import {BashScriptAsset} from "./assets/bash";
import {JSScriptAsset} from "./assets/js";
import {aff} from "./shared/utils";
import {expect, test, beforeEach, beforeAll, afterAll} from '@jest/globals';
import {LaunchersAsset} from "./assets/launchers";
import {Console} from "console";
import {ExpandMergeResults} from "./schema/results";

new aff(); // crazy util.


let tedisPool: TedisPool;
let defaultResolver: RepoResolver;
let geoipReaders: GeoIpReaders;
let defaultBaseUrl: string;
let defaultClientIP: string;
const initialRecipes: string[] = ['k8s', 'conditions'];

beforeEach(async () => {
    // restore the original console.
    global.console = new Console({
        stdout: process.stdout,
        stderr: process.stderr,
        colorMode: true
    });
})

beforeAll(async () => {
    defaultClientIP = "62.251.42.9";
    defaultBaseUrl = "https://cloud-init.pardini.net/";

    tedisPool = new TedisPool();
    geoipReaders = await (new DefaultGeoIPReaders()).prepareReaders();

    defaultResolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    await defaultResolver.rootResolve();
});

afterAll(async () => {
    await tedisPool.release();
});


test('default no-param bash', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // bash render.
    let rendered = await (new BashScriptAsset(context, defaultResolver, "scripts/base.sh")).renderFromFile();
    console.log("Rendered is", rendered.length, "bytes long.");

    expect(rendered).toContain("#!/bin/bash");
    expect(rendered).not.toContain("**INCLUDE");
    expect(rendered).toContain("Base configuration done");
});


test('default no-param js asset', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    let rendered = await (new JSScriptAsset(context, defaultResolver, "js/showoff.mjs")).renderFromFile();

    expect(rendered).toContain("#!/bin/bash");
    expect(rendered).not.toContain("**INCLUDE");
    expect(rendered).toContain("base64 --decode");
    expect(rendered).toContain("jsLauncherPrepareNVM");
    expect(rendered).toContain("jsLauncherNPMInstall");
    expect(rendered).toContain("jsLauncherDoLaunch");

    console.log("Rendered is", rendered.length, "bytes long.");
});

test('default no-param expand and merge', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // initial expansion.
    let expanderMerger: CloudInitExpanderMerger = new CloudInitExpanderMerger(context, defaultResolver, initialRecipes);
    let result: ExpandMergeResults = await expanderMerger.process();

    expect(result.cloudConfig).toBeTruthy();
    expect(result.cloudConfig.messages?.length).toBeGreaterThan(3);
});


test('default no-param processor', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // full expansion
    let expanderMerger: CloudInitExpanderMerger = new CloudInitExpanderMerger(context, defaultResolver, initialRecipes);
    let expanderMergerResult: ExpandMergeResults = await expanderMerger.process();

    let cloudConfigObj: any = expanderMergerResult.processedCloudConfig; // any is for testing purposes only
    expect(cloudConfigObj.messages).toBeUndefined(); // make sure processors ran
    expect(cloudConfigObj.users).toBeDefined();

    let yaml: string = YAML.stringify(cloudConfigObj, {});
    expect(yaml).toContain("- ");
    expect(yaml).toContain("All conditions tested");
    console.log("yaml is", yaml.length, "bytes long.");
});

test('default no-param launchers', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // full expansion.
    // put the expanded in context...
    context.expandedMergedResults = await new CloudInitExpanderMerger(context, defaultResolver, initialRecipes).process();

    let body = await (new LaunchersAsset(context, defaultResolver, "oldskool-bundle")).renderFromFile();

    expect(body).toContain("#!/bin/bash");
    expect(body).not.toContain("**INCLUDE");
    expect(body).toContain("createLauncherScript \"showoff"); // js launcher
    expect(body).toContain("createLauncherScript \"example\" \"bash/scripts/example.sh\""); // bash launcher
    expect(body).toContain("createLauncherScript \"tsshow\" \"js/js/tsshow.ts\""); // typescript launcher
});

