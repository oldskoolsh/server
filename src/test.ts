import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";
import {RenderingContext} from "./repo/context";
import {CloudInitRecipeListExpander} from "./expander_merger/ci_expander";
import {Recipe} from "./repo/recipe";
import {CloudInitProcessorStack} from "./processors/stack";
import YAML from 'yaml';
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders} from "./shared/geoip";
import {CloudInitExpanderMerger} from "./expander_merger/expandermerger";
import exp from "constants";


async function faz() {
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    let repo: Repository = await resolver.rootResolve();

    let context = new RenderingContext("https://cloud-init.pardini.net/", new TedisPool(), await (new DefaultGeoIPReaders()).prepareReaders());
    await context.init();
    context.clientIP = "62.251.42.9";
    try {
        // bash render.
        // let rendered = await (new BashScriptAsset(context, resolver, "base.sh")).renderFromFile();


        // initial expansion.
        let initialRecipes:string[] = ['k8s'];

        let expanderMerger: CloudInitExpanderMerger = new CloudInitExpanderMerger(context, resolver, initialRecipes);
        let smth = await expanderMerger.process();

        // processors run when everything else is already included.
        let finalResult = await new CloudInitProcessorStack(context, resolver, smth).addDefaultStack().process();
        await console.log("finalResult\n---", YAML.stringify(finalResult, {}), "\n---");


    } finally {
        await context.logClientData();
    }
}

faz().then(() => {
    console.log("Done");
}).catch(reason => {
    console.error("FIRST LEVEL THROW", reason);
})
