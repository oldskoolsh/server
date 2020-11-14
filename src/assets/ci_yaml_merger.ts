import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";
import {CloudConfigFragment} from "../repo/cifragment";

// merge
import deepmerge from "deepmerge";
import {BaseCondition, ICondition} from "./ci_condition";

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
            console.group("fragment recipe id: ", parsedFragment.recipe.id)
            if (await this.evaluateFragment(parsedFragment)) {
                resolvedFragments.push(await this.expandVariables(parsedFragment));
            }
            console.groupEnd();
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


    private async evaluateFragment(fragment: CloudConfigFragment):Promise<boolean> {
        if (!fragment.condition) return true;

        for (const conditionKey of Object.keys(fragment.condition)) {
            let conditionValue = fragment.condition[conditionKey];

            if (conditionValue instanceof Array) {
                let allConds: (boolean)[] =
                    await Promise.all(
                        conditionValue.map(async value => {
                            let impl: ICondition = this.createConditionImplementation(conditionKey, value);
                            await impl.prepare();
                            if (!await impl.evaluate()) {
                                await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, false)
                                return false;
                            }
                            await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, true)
                            return true;
                        })
                    );
                let anyOfTheConditionsInArray = allConds.some(value => value);
                await console.log(`[array] final conditions evaluated to`, anyOfTheConditionsInArray)
                if (!anyOfTheConditionsInArray) return false;
            } else {
                let impl: ICondition = this.createConditionImplementation(conditionKey, conditionValue);
                if (!await impl.evaluate()) {
                    await console.log(`[array] Condition with key '${conditionKey}' and value '${conditionValue}' evaluated to `, false)
                    return false;
                } else {
                    await console.log(`Condition with key '${conditionKey}' and value '${conditionValue}' evaluated to `, true)
                }
            }
        }
        await console.log("In the end evaluated to", true);
        return true;
    }

    private createConditionImplementation(name: string, value: any) {
        return BaseCondition.getConditionImplementation(this.context, name, value);
    }

    private async expandVariables(parsedFragment: CloudConfigFragment) {

        return undefined;
    }
}
