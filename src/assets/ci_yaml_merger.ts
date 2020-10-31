import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";

export class CloudInitYamlMerger {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: Recipe[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: Recipe[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
    }

    async mergeYamls() {
        // @TODO: https://eemeli.org/yaml/#parsing-documents
        throw new Error("mergeYamls Method not implemented.");
    }


}
