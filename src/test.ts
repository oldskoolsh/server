import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";
import {RenderingContext} from "./assets/context";
import {CloudInitRecipeListExpander} from "./assets/ci_expander";
import {Recipe} from "./repo/recipe";
import {CloudInitYamlMerger} from "./assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "./processors/stack";
import YAML from 'yaml';
import {TedisPool} from "tedis";
import {DefaultGeoIPReaders} from "./shared/geoip";


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
        let newList: Recipe[] = await (new CloudInitRecipeListExpander(context, resolver, ['base'])).expand();
        await console.log("Expanded list", newList.map(value => value.id));


        // super-new merger.
        let smth = await (new CloudInitYamlMerger(context, resolver, newList)).mergeYamls();



        // processors run when everything else is already included.
        let finalResult = await new CloudInitProcessorStack(context, resolver, smth).addDefaultStack().process();
        await console.log("finalResult\n---", YAML.stringify(finalResult, {}), "\n---");


    } finally {
        await context.deinit();
    }
}

faz().then(() => {
    console.log("Done");
}).catch(reason => {
    console.error("FIRST LEVEL THROW", reason);
})
