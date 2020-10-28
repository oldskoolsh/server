import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";
import {BashScriptAsset} from "./assets/bash";
import {RenderingContext} from "./assets/context";

async function faz() {
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github", "oldskool-rpardini");
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
    console.log("rendered", rendered);


}

faz().then(() => {
    console.log("Done");
});
