import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";
import {CloudInitRecipeListExpander} from "./ci_expander";
import {CIRecipeFragment, CIRecipeFragmentIf, CloudConfigSuperFragment} from "./superfragment";
import {BaseCondition, ICondition} from "../conditions/ci_condition";
import {IRecipeFragmentIfConditionsConditionEnum, IRecipeFragmentResultDef} from "../repo/recipe_def";
import deepmerge from "deepmerge";


class CloudInitSuperMerger {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: Recipe[];

    // the stack...
    protected cloudConfig: any = {};

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: Recipe[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
    }

    async evaluateAndMergeAll() {
        // Given a list of recipes, get all the fragments.
        let allFragments: CloudConfigSuperFragment[] = [];

        // get a list of actual fragments; yamls are multi-doc
        for (const recipe of this.initialRecipes) {
            allFragments.push(...await recipe.getCloudConfigDocs());
        }
        //console.log("allFragments", allFragments);

        // now parse them, fully async.
        let allParsedFragments: CIRecipeFragment[] = await Promise.all(allFragments.map(async value => value.parse()));

        // recursively evaluate. this will fill the stacks...
        //console.log("allParsedFragments", allParsedFragments);


        this.cloudConfig = {"fake": "here"};
        for (const parsedFragment of allParsedFragments) {
            await this.recursivelyEvaluate(new CIRecipeFragmentIf(parsedFragment.if, parsedFragment.sourceFragment));
        }

        return this.cloudConfig;
    }


    private async recursivelyEvaluate(superFragment: CIRecipeFragmentIf) {
        console.group("fragment recipe", superFragment.sourceFragment.sourceRef()) // @TODO: propagate source info to CIRecipeFragment
        try {
            let resultFrag: IRecipeFragmentResultDef;
            if (await this.doesIfConditionEvaluateToTrue(superFragment)) {
                console.log("conditions evaluated to", true, superFragment.conditions)
                resultFrag = superFragment.then || {};
            } else {
                console.log("conditions evaluated to", false, superFragment.conditions)
                resultFrag = superFragment.else || {};
            }

            if (resultFrag.cloudConfig)
                this.cloudConfig = deepmerge(this.cloudConfig, resultFrag.cloudConfig);

            if (resultFrag.andIf) {
                await this.recursivelyEvaluate(new CIRecipeFragmentIf(resultFrag.andIf, superFragment.sourceFragment))
            }

            if (resultFrag.and) {
                for (const iFrag of resultFrag.and) {
                    await this.recursivelyEvaluate(new CIRecipeFragmentIf(iFrag.if, superFragment.sourceFragment));
                }
            }
        } finally {
            console.groupEnd();
        }
    }

    private async doesIfConditionEvaluateToTrue(fragment: CIRecipeFragmentIf): Promise<boolean> {
        if (!fragment.conditions) return true;

        for (const conditionKey of Object.keys(fragment.conditions)) {
            let conditionValue = fragment.conditions[conditionKey as IRecipeFragmentIfConditionsConditionEnum];

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


}

export class CloudInitExpanderMerger {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: string[];
    protected currentRecipes: string[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.currentRecipes = initialRecipes;
    }

    async process() {
        let newList: Recipe[] = await (new CloudInitRecipeListExpander(this.context, this.repoResolver, this.currentRecipes)).expand();
        await console.log("Expanded list", newList.map(value => value.id));

        let merger = new CloudInitSuperMerger(this.context, this.repoResolver, newList);
        return await merger.evaluateAndMergeAll();

    }
}
