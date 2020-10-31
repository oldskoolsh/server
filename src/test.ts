import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";
import {BashScriptAsset} from "./assets/bash";
import {RenderingContext} from "./assets/context";
import {CloudInitRecipeListExpander} from "./assets/ci_expander";
import {Recipe} from "./repo/recipe";
import {CloudInitYamlMerger} from "./assets/ci_yaml_merger";


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
    console.log("Expanded list", newList.map(value => value.id));


    // now given the final list of recipes
    // read and merge all the yamls
    // process it for runtime-dependent values (esp: os, release, client IP/hostname/etc) and hack into the yaml
    // write resulting yaml


    let smth = await (new CloudInitYamlMerger(context, resolver, newList)).mergeYamls();












}

faz().then(() => {
    console.log("Done");
});
