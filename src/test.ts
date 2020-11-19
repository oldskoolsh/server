import {RepoResolver} from "./repo/resolver";
import {RenderingContext} from "./repo/context";
import {CloudInitProcessorStack} from "./processors/stack";
import YAML from 'yaml';
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders, GeoIpReaders} from "./shared/geoip";
import {CloudInitExpanderMerger} from "./expander_merger/expandermerger";
import {BashScriptAsset} from "./assets/bash";
import {JSScriptAsset} from "./assets/js";
import {aff} from "./shared/utils";
import {expect, test} from '@jest/globals';

new aff();


let tedisPool: TedisPool;
let resolver: RepoResolver;
let geoipReaders: GeoIpReaders;
let defaultBaseUrl: string;
let defaultClientIP: string;

beforeEach(async () => {
    // restore the original console.
    // @ts-ignore
    global.console = global.originalConsole;
})

beforeAll(async () => {
    defaultClientIP = "62.251.42.9";
    defaultBaseUrl = "https://cloud-init.pardini.net/";

    tedisPool = new TedisPool();
    geoipReaders = await (new DefaultGeoIPReaders()).prepareReaders();

    resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    await resolver.rootResolve();
});

afterAll(async () => {
    await tedisPool.release();
});


test('default no-param bash', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // bash render.
    let rendered = await (new BashScriptAsset(context, resolver, "base.sh")).renderFromFile();

    expect(rendered).toContain("#!/bin/bash");
    expect(rendered).not.toContain("**INCLUDE");
    expect(rendered).toContain("Base configuration done");
});


test('default no-param js asset', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    let rendered = await (new JSScriptAsset(context, resolver, "showoff.mjs")).renderFromFile();

    expect(rendered).toContain("#!/bin/bash");
    expect(rendered).not.toContain("**INCLUDE");
    expect(rendered).toContain("base64 --decode");
    expect(rendered).toContain("jsLauncherPrepareNVM");
    expect(rendered).toContain("jsLauncherNPMInstall");
    expect(rendered).toContain("jsLauncherDoLaunch");
});

test('default no-param expand and merge', async () => {
    let context = new RenderingContext(defaultBaseUrl, tedisPool, geoipReaders);
    context.clientIP = defaultClientIP;
    await context.init();

    // initial expansion.
    let initialRecipes: string[] = ['k8s'];
    let expanderMerger: CloudInitExpanderMerger = new CloudInitExpanderMerger(context, resolver, initialRecipes);
    let smth = await expanderMerger.process();

    expect(smth).toBeTruthy();
    expect(smth.messages.length).toBeGreaterThan(3);

    // processors run when everything else is already included.
    let finalResult: any = await new CloudInitProcessorStack(context, resolver, smth).addDefaultStack().process();
    expect(finalResult.messages).toBeUndefined();

    let yaml: string = YAML.stringify(finalResult, {});

    expect(yaml).toContain("- ");
});

