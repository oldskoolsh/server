import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";
import {Recipe} from "../repo/recipe";
import {CloudInitFlatRecipeExpanderFromRecipeDefs} from "./ci_expander";
import {CIRecipeFragment, CIRecipeFragmentIf, CloudConfigSuperFragment} from "./superfragment";
import {BaseCondition, ICondition} from "../conditions/ci_condition";
import {IRecipeFragmentIfConditionsConditionEnum, IRecipeFragmentResultDef} from "../schema/recipe_fragment";
import deepmerge from "deepmerge";
import path from "path";
import {CloudInitProcessorStack} from "../processors/stack";
import {ExpandMergeResults, IExecutableScript} from "../schema/results";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

const debug = false;


class RestartProcessingException extends Error {
}


class CloudInitSuperMerger {
    // string representations of the wantedRecipes
    public wantedRecipesSet: Set<string> = new Set<string>();
    public wantedRecipesStr: string[];

    // the stack... and results.
    public cloudConfig: ExtendedCloudConfig = {};
    public recipes: Recipe[];
    public launcherDefs: IExecutableScript[] = [];
    public initScripts: IExecutableScript[] = [];

    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: Recipe[];


    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: Recipe[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.initialRecipes = initialRecipes;
        this.recipes = initialRecipes;
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


        // initial stack;
        this.cloudConfig = {}; // every run starts clean cloud-Config wise.
        await this.prepareLaunchersAndScripts(this.initialRecipes);

        for (const parsedFragment of allParsedFragments) {
            await this.recursivelyEvaluate(new CIRecipeFragmentIf(parsedFragment.if, parsedFragment.sourceFragment));
        }

    }

    private includeRecipeAndThrowIfNotAlreadyIncluded(recipes: string[], sourceRecipe: Recipe) {
        if (recipes.length == 0) return;

        // filter out the recipes we already have...
        let newRecipes = recipes.filter(possiblyNewRecipeName => !this.wantedRecipesSet.has(possiblyNewRecipeName));
        if (newRecipes.length == 0) return;

        let currentRecipeIndex = this.wantedRecipesStr.indexOf(sourceRecipe.id) + 1;
        if (debug) console.log("splice before", this.wantedRecipesStr, "index", currentRecipeIndex, "source", sourceRecipe.id);

        for (const recipe of newRecipes) {
            this.wantedRecipesStr.splice(currentRecipeIndex, 0, recipe);
            currentRecipeIndex++;
        }
        if (debug) console.log("after", this.wantedRecipesStr)

        throw new RestartProcessingException("Included new recipes " + newRecipes.join(","));
    }

    private async recursivelyEvaluate(superFragment: CIRecipeFragmentIf) {
        if (debug) console.group("fragment => ", superFragment.sourceFragment.sourceRef()) // @TODO: propagate source info to CIRecipeFragment
        try {
            let resultFrag: IRecipeFragmentResultDef;
            if (await this.doesIfConditionEvaluateToTrue(superFragment)) {
                if (debug) console.log("conditions evaluated to", true, superFragment.conditions)
                resultFrag = superFragment.then || {};
            } else {
                if (debug) console.log("conditions evaluated to", false, superFragment.conditions)
                resultFrag = superFragment.else || {};
            }

            if (resultFrag.cloudConfig) {
                if (debug) console.log("merging", resultFrag.cloudConfig);
                this.cloudConfig = deepmerge(this.cloudConfig, resultFrag.cloudConfig);
            } else {
                if (debug) console.log("NOT merging, empty");
            }

            if (resultFrag.message) {
                this.cloudConfig = deepmerge(this.cloudConfig, {messages: [`[${superFragment.sourceFragment.sourceRef()}] ${resultFrag.message}`]});
            }

            // Handle the inclusions. Each inclusion can cause exception...
            if (resultFrag.include) {
                if (resultFrag.include.recipes) {
                    if (debug) console.log("Including recipes...", resultFrag.include.recipes);
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
                    if (iFrag.if) {
                        await this.recursivelyEvaluate(new CIRecipeFragmentIf(iFrag.if, superFragment.sourceFragment));
                    } else {
                        console.error("and without if!?")
                    }
                }
            }
        } finally {
            if (debug) console.groupEnd();
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
                                if (debug) await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, false)
                                return false;
                            }
                            if (debug) await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, true)
                            return true;
                        })
                    );
                let anyOfTheConditionsInArray = allConds.some(value => value);
                if (debug) await console.log(`[array] final conditions evaluated to`, anyOfTheConditionsInArray)
                if (!anyOfTheConditionsInArray) return false;
            } else {
                let impl: ICondition = this.createConditionImplementation(conditionKey, conditionValue);
                if (!await impl.evaluate()) {
                    if (debug) await console.log(`[array] Condition with key '${conditionKey}' and value '${conditionValue}' evaluated to `, false)
                    return false;
                } else {
                    if (debug) await console.log(`Condition with key '${conditionKey}' and value '${conditionValue}' evaluated to `, true)
                }
            }
        }
        //await console.log("In the end evaluated to", true);
        return true;
    }

    private createConditionImplementation(name: string, value: any) {
        return BaseCondition.getConditionImplementation(this.context, name, value);
    }


    private async prepareLaunchersAndScripts(recipes: Recipe[]) {
        let resolvedInitScripts = await recipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_initscripts));


        let launcherScripts: string[] = await recipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_launchers));
        this.launcherDefs = launcherScripts.map(value => this.processLauncherScript(value));

        this.initScripts = resolvedInitScripts.map(value => this.processLauncherScript(value));

    }

    private processLauncherScript(script: string): IExecutableScript {
        let parsed: path.ParsedPath = path.parse(script);
        let extension = path.extname(script);
        console.log("scirpt", script, "ext", extension);
        let renderPath = (extension == ".sh") ? "bash/" : "js/";
        return ({
            launcherName: parsed.name,
            assetPath: `${renderPath}${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}${parsed.ext}`
        });
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

    async process(): Promise<ExpandMergeResults> {
        try {
            await this.processOneYAMLRun();

            // since that worked (did not throw), invoke the processor stack; context could modify the processor stack.
            const processedCloudConfig: StandardCloudConfig = await new CloudInitProcessorStack(this.context, this.repoResolver, this.currentMerger.cloudConfig)
                .addDefaultStack()
                .process();

            return {
                cloudConfig: this.currentMerger.cloudConfig,
                recipes: this.currentMerger.recipes,
                initScripts: this.currentMerger.initScripts,
                launcherDefs: this.currentMerger.launcherDefs,
                processedCloudConfig: processedCloudConfig
            } as ExpandMergeResults;

        } catch (e) {
            if (debug) console.log("Thrown!")
            if (e instanceof RestartProcessingException) {
                if (debug) console.log(`Thrown RestartProcessingException! :: ${e.message}`)
                this.currentRecipes = this.currentMerger.wantedRecipesStr;
                return await this.process();
            }
            throw e;
        }
    }

    private async processOneYAMLRun(): Promise<void> {
        this.runNumber++;
        if (debug) console.group("Single run number " + this.runNumber);
        try {
            // Expand according to simple rules...
            let recipeList: Recipe[] = await (new CloudInitFlatRecipeExpanderFromRecipeDefs(this.context, this.repoResolver, this.currentRecipes)).expand();
            if (debug) await console.log("Expanded list", recipeList.map(value => value.id));

            this.currentMerger = new CloudInitSuperMerger(this.context, this.repoResolver, recipeList);
            this.currentMerger.recipes = recipeList;
            await this.currentMerger.evaluateAndMergeAll();


        } finally {
            if (debug) console.groupEnd();
        }
    }
}
