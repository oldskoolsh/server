import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";
import {BashScriptAsset} from "./assets/bash";
import {RenderingContext} from "./assets/context";
import {CloudInitRecipeListExpander} from "./assets/ci_expander";
import {Recipe} from "./repo/recipe";
import {CloudInitYamlMerger} from "./assets/ci_yaml_merger";
import {CloudInitYamlProcessorSSHKeys} from "./processors/ssh_keys";
import {CloudInitYamlProcessorAptSources} from "./processors/apt_sources";
import {CloudInitProcessorStack} from "./processors/stack";
import YAML from 'yaml';
import {CloudInitYamlProcessorAptProxy} from "./processors/proxy";
import {CloudInitYamlProcessorAptMirror} from "./processors/mirror";
import {CloudInitYamlProcessorPackages} from "./processors/packages";


async function faz() {
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    let repo: Repository = await resolver.rootResolve();
    //console.log("resolver.resolve()", repo);
    /*

        let yaml = await resolver.getRawAsset("ci/base.yaml");
        console.log("yaml", yaml);

        let common = await resolver.getRawAsset("scripts/common.sh");
        console.log("common", common);
    */

    let context = new RenderingContext("https://cloud-init.pardini.net/");
    await context.init();
    try {

        let rendered = await (new BashScriptAsset(context, resolver, "base.sh")).render();
        //console.log("rendered", rendered);

        // for the main c-i stuff
        // we have a prebuilt repo resolver reference (which has a root repo)
        // and a list of wanted recipes;
        // we'll first expand the list, processing toml directives like "always", "os", "release" etc
        // and includes/conditional_includes are also processed in the expand step, for clarity (?)
        // and get a new list.
        // that will generate an intermediate URL with the expanded list and parameters etc for the merger

        let newList: Recipe[] = await (new CloudInitRecipeListExpander(context, resolver, ['k8s'])).expand();
        await console.log("Expanded list", newList.map(value => value.id));
        let required = newList.filter(value => value.id === "k8s_docker_ng");
        if (!(required.length > 0)) {
            throw new Error("Did not expand docker.");
        }


        // now given the final list of recipes
        // read and merge all the yamls
        // process it for runtime-dependent values (esp: os, release, client IP/hostname/etc) and hack into the yaml
        // write resulting yaml

        // @TODO: possibly "includes" in here? Back to the expander?
        let smth = await (new CloudInitYamlMerger(context, resolver, newList)).mergeYamls();
        //await console.log("merged yamls", YAML.stringify(smth));


        // ok now processing of the pre-merged yaml
        // a lot of shit client related, geoip, reverse hostname lookup, etc
        // to produce
        //  proxy
        //  mirror
        //  keys
        //  sources (with gpg lookup)
        //let sourcesProcessed = await (new CloudInitYamlProcessorAptSources(context, resolver, smth)).process();
        //await console.log("sourcesProcessed", YAML.stringify(sourcesProcessed));


        // let keysProcessed = await (new CloudInitYamlProcessorSSHKeys(context, resolver)).process(smth);
        //await console.log("keysProcessed.users", YAML.stringify(keysProcessed, {}));


        // Processor stack processing

        let finalResult = await new CloudInitProcessorStack(context, resolver, smth)
            .add(new CloudInitYamlProcessorAptSources())
            .add(new CloudInitYamlProcessorSSHKeys())
            .add(new CloudInitYamlProcessorAptProxy())
            .add(new CloudInitYamlProcessorAptMirror())
            .add(new CloudInitYamlProcessorPackages())
            .process();
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
