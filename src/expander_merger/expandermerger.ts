import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";
import {CloudInitRecipeListExpander} from "./ci_expander";
import {CIRecipeFragment, CIRecipeFragmentIf, CloudConfigSuperFragment} from "./superfragment";
import {BaseCondition, ICondition} from "../conditions/ci_condition";
import {IRecipeFragmentIfConditionsConditionEnum, IRecipeFragmentResultDef} from "../repo/recipe_def";
import deepmerge from "deepmerge";


class RestartProcessingException extends Error {
}

class CloudInitSuperMerger {
    public wantedRecipesSet: Set<string> = new Set<string>();
    public wantedRecipesStr: string[];
    // the stack... and results.
    public cloudConfig: any = {};
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: Recipe[];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: Recipe[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.wantedRecipesStr = initialRecipes.map(value => value.id);
        this.wantedRecipesSet = new Set<string>(this.wantedRecipesStr);
    }

    async evaluateAndMergeAll() {
        // Given a list of recipes, get all the fragments.
        let allFragments: CloudConfigSuperFragment[] = [];

        // get a list of actual fragments; yamls are multi-doc
        for (const recipe of this.initialRecipes) {
            allFragments.push(...await recipe.getCloudConfigDocs());
        }

        // now parse them, fully async.
        let allParsedFragments: CIRecipeFragment[] = await Promise.all(allFragments.map(async value => value.parse()));

        this.cloudConfig = {}; // every run starts clean.
        for (const parsedFragment of allParsedFragments) {
            await this.recursivelyEvaluate(new CIRecipeFragmentIf(parsedFragment.if, parsedFragment.sourceFragment));
        }

    }

    private includeRecipeAndThrowIfNotAlreadyIncluded(recipes: string[], sourceRecipe: Recipe) {
        if (recipes.length == 0) return;

        // filter out the recipes we already have...
        let newRecipes = recipes.filter(possiblyNewRecipeName => !this.wantedRecipesSet.has(possiblyNewRecipeName));
        if (newRecipes.length == 0) return;

        let currentRecipeIndex = this.wantedRecipesStr.indexOf(sourceRecipe.id)+1;
        console.log("splice before", this.wantedRecipesStr, "index", currentRecipeIndex, "source", sourceRecipe.id);

        for (const recipe of newRecipes) {
            this.wantedRecipesStr.splice(currentRecipeIndex, 0, recipe);
            currentRecipeIndex++;
        }
        console.log("after", this.wantedRecipesStr)

        throw new RestartProcessingException("Included new recipes " + newRecipes.join(","));
    }

    private async recursivelyEvaluate(superFragment: CIRecipeFragmentIf) {
        console.group("fragment => ", superFragment.sourceFragment.sourceRef()) // @TODO: propagate source info to CIRecipeFragment
        try {
            let resultFrag: IRecipeFragmentResultDef;
            if (await this.doesIfConditionEvaluateToTrue(superFragment)) {
                console.log("conditions evaluated to", true, superFragment.conditions)
                resultFrag = superFragment.then || {};
            } else {
                console.log("conditions evaluated to", false, superFragment.conditions)
                resultFrag = superFragment.else || {};
            }

            if (resultFrag.cloudConfig) {
                console.log("merging", resultFrag.cloudConfig);
                this.cloudConfig = deepmerge(this.cloudConfig, resultFrag.cloudConfig);
            } else {
                console.log("NOT merging, empty");
            }

            if (resultFrag.message) {
                this.cloudConfig = deepmerge(this.cloudConfig, {messages: [`[${superFragment.sourceFragment.sourceRef()}] ${resultFrag.message}`]});
            }

            // Handle the inclusions. Each inclusion can cause exception...
            if (resultFrag.include) {
                if (resultFrag.include.recipes) {
                    console.log("Including recipes...", resultFrag.include.recipes);
                    if (resultFrag.include.recipes instanceof Array)
                        this.includeRecipeAndThrowIfNotAlreadyIncluded(resultFrag.include.recipes, superFragment.sourceFragment.recipe);
                    else
                        this.includeRecipeAndThrowIfNotAlreadyIncluded([resultFrag.include.recipes], superFragment.sourceFragment.recipe);
                }
            }

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
        //await console.log("In the end evaluated to", true);
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
    protected runNumber: number = 0;

    protected currentRecipes!: string[];
    protected currentMerger!: CloudInitSuperMerger;

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.currentRecipes = this.initialRecipes;
    }

    async process(): Promise<any> {
        try {
            return await this.processOneRun();
        } catch (e) {
            console.log("Thrown!")
            if (e instanceof RestartProcessingException) {
                console.log(`Thrown RestartProcessingException! :: ${e.message}`)
                this.currentRecipes = this.currentMerger.wantedRecipesStr;
                return await this.process();
            }
            throw e;
        }
    }

    async processOneRun() {
        this.runNumber++;
        console.group("Single run number " + this.runNumber);
        try {
            let newList: Recipe[] = await (new CloudInitRecipeListExpander(this.context, this.repoResolver, this.currentRecipes)).expand();
            await console.log("Expanded list", newList.map(value => value.id));
            this.currentMerger = new CloudInitSuperMerger(this.context, this.repoResolver, newList);
            await this.currentMerger.evaluateAndMergeAll();
            return this.currentMerger.cloudConfig;
        } finally {
            console.groupEnd();
        }
    }


}