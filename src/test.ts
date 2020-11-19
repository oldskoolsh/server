import {RepoResolver} from "./repo/resolver";
import {RenderingContext} from "./repo/context";
import {CloudInitProcessorStack} from "./processors/stack";
import YAML from 'yaml';
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders} from "./shared/geoip";
import {CloudInitExpanderMerger} from "./expander_merger/expandermerger";


test('simple expander/merger run', async () => {
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    await resolver.rootResolve();
    let tedisPool = new TedisPool();
    try {
        let geoipReaders = await (new DefaultGeoIPReaders()).prepareReaders();
        let context = new RenderingContext("https://cloud-init.pardini.net/", tedisPool, geoipReaders);
        await context.init();

        context.clientIP = "62.251.42.9";

        // bash render.
        // let rendered = await (new BashScriptAsset(context, resolver, "base.sh")).renderFromFile();

        // initial expansion.
        let initialRecipes: string[] = ['k8s'];

        let expanderMerger: CloudInitExpanderMerger = new CloudInitExpanderMerger(context, resolver, initialRecipes);
        let smth = await expanderMerger.process();

        // processors run when everything else is already included.
        let finalResult = await new CloudInitProcessorStack(context, resolver, smth).addDefaultStack().process();
        let yaml = YAML.stringify(finalResult, {});
    } finally {
        await tedisPool.release();
    }

    expect(3).toBe(3);
});

