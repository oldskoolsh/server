import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";
import {CloudConfigFragment} from "../repo/cifragment";


// merge
import deepmerge from "deepmerge";
import {ICondition, OSCondition, ReleaseCondition} from "./ci_condition";

export class CloudInitYamlMerger {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly recipes: Recipe[];

    constructor(context: RenderingContext, resolver: RepoResolver, recipes: Recipe[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.recipes = recipes;
    }

    async mergeYamls() {
        // @TODO: https://eemeli.org/yaml/#parsing-documents

        let allFragments: CloudConfigFragment[] = [];
        // get a list of actual fragments; yamls are multi-doc
        for (const recipe of this.recipes) {
            let docs = await recipe.getCloudConfigDocs();
            allFragments.push(...docs);
        }
        // now parse them into a promise array, full async
        let allParsedFragments: CloudConfigFragment[] = await Promise.all(allFragments.map(async value => value.parse()));

        // now resolve the conditions.
        let resolvedFragments: CloudConfigFragment[] = [];
        for (const parsedFragment of allParsedFragments) {
            if (await this.evaluateFragment(parsedFragment)) {
                resolvedFragments.push(parsedFragment);
            }
        }

        //console.log(resolvedFragments);

        let result = {};
        for (const resolvedFragment of resolvedFragments) {
            let piece = resolvedFragment.contents;
            result = deepmerge(result, piece);
        }
        //console.log(result);

        return result;
    }


    private async evaluateFragment(fragment: CloudConfigFragment) {
        if (!fragment.condition) return true;

        for (const conditionKey of Object.keys(fragment.condition)) {
            let conditionValue = fragment.condition[conditionKey];

            if (conditionValue instanceof Array) {
                let allConds: (boolean)[] =
                await Promise.all(
                    conditionValue.map(async value => {
                        let impl: ICondition = this.createConditionImplementation(conditionKey, value);
                        if (!await impl.evaluate()) return false;
                        return true;
                    })
                );
                return allConds.some(value => value);
            } else {
                let impl: ICondition = this.createConditionImplementation(conditionKey, conditionValue);
                if (!await impl.evaluate()) return false;
            }
        }
        return true;
    }

    private createConditionImplementation(name: string, value: any) {
        switch (name) {
            case "os":
                return new OSCondition(this.context, value);
            case "release":
                return new ReleaseCondition(this.context, value);
        }
        throw new Error(`Unimplemented condition '${name}'`);
    }
}
