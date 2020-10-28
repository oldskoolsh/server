import {RepoResolver} from "./repo/resolver";
import {Repository} from "./repo/repo";

async function faz() {
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github", "oldskool-rpardini");
    let repo: Repository = await resolver.rootResolve();
    console.log("resolver.resolve()", repo);

    let yaml = await resolver.getRawAsset("ci/base.yaml");
    console.log("yaml", yaml);

    let common = await resolver.getRawAsset("scripts/common.sh");
    console.log("common", common);

}

faz().then(() => {
    console.log("Done");
});
