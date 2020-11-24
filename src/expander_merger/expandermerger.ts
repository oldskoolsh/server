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

    public wantedRecipes: string[];

    constructor(message: string, wantedRecipes: string[]) {
        super(message);
        this.wantedRecipes = wantedRecipes;
    }
}


class CloudInitSuperMerger {
    // the stack... and results.
    public cloudConfig: ExtendedCloudConfig = {};
    public readonly recipes: Recipe[]; // readonly, cause new recipes immediately cause a restart
    public initScripts: string[] = []; // read-write; initScripts and launchers cause a restart at the end of processing
    public launcherScripts: string[] = [];

    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;

    constructor(context: RenderingContext, resolver: RepoResolver, recipes: Recipe[], initScripts: string[], launcherScripts: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.recipes = recipes;
        this.initScripts = initScripts;
        this.launcherScripts = launcherScripts;
    }

    async evaluateAndMergeAll() {
        // Given a list of recipes, get all the fragments.
        let allFragments: CloudConfigSuperFragment[] = [];

        // get a list of actual fragments; yamls are multi-doc
        for (const recipe of this.recipes) {
            allFragments.push(...await recipe.getCloudConfigDocs());
        }

        // now parse them, fully async.
        let allParsedFragments: CIRecipeFragment[] = await Promise.all(allFragments.map(async value => value.parse()));

        // initial cloud-config stack.
        this.cloudConfig = {}; // every run starts clean cloud-Config wise.

        // initial initScripts, coming from the executables.
        // initial launcherScripts, coming from the executables.

        for (const parsedFragment of allParsedFragments) {
            await this.recursivelyEvaluate(new CIRecipeFragmentIf(parsedFragment.if, parsedFragment.sourceFragment));
        }

        // If we get here, all initScripts/launchers have been stable-resolved, recipe-wise.
        // Process the scripts to find other recipes/initScripts/launchers in the comments.
        // Throw if not in the stack;
        // await this.processAllScripts();

    }


    private async includeInitScriptsFromGlob(possiblyNewExecutables: string[], sourceRecipe: Recipe) {
        if (possiblyNewExecutables.length == 0) return;
        if (debug) console.warn("Should include INITSCRIPT", possiblyNewExecutables);
        let possiblyNewExpandedGlobs = await sourceRecipe.expandGlobs(possiblyNewExecutables);
        console.warn("resolved included INITSCRIPT", possiblyNewExpandedGlobs);
        this.initScripts = [...new Set([...this.initScripts, ...possiblyNewExpandedGlobs])];
    }

    private async includeLauncherScriptsFromGlob(possiblyNewExecutables: string[], sourceRecipe: Recipe) {
        if (possiblyNewExecutables.length == 0) return;
        if (debug) console.warn("Should include LAUNCHERSCRIPT", possiblyNewExecutables);
        let possiblyNewExpandedGlobs = await sourceRecipe.expandGlobs(possiblyNewExecutables);
        console.warn("resolved included LAUNCHERSCRIPT", possiblyNewExpandedGlobs);
        this.launcherScripts = [...new Set([...this.launcherScripts, ...possiblyNewExpandedGlobs])];
    }

    private includeRecipeAndThrowIfNotAlreadyIncluded(possiblyNewRecipes: string[], sourceRecipe: Recipe) {
        let wantedRecipesStr = this.recipes.map(value => value.id); // all the initial...

        if (possiblyNewRecipes.length == 0) return;

        // filter out the recipes we already have...
        let newRecipes = possiblyNewRecipes.filter(possiblyNewRecipeName => wantedRecipesStr.includes(possiblyNewRecipeName));
        if (newRecipes.length == 0) return;

        let currentRecipeIndex = wantedRecipesStr.indexOf(sourceRecipe.id) + 1;
        if (debug) console.log("splice before", wantedRecipesStr, "index", currentRecipeIndex, "source", sourceRecipe.id);

        for (const recipe of newRecipes) {
            wantedRecipesStr.splice(currentRecipeIndex, 0, recipe);
            currentRecipeIndex++;
        }
        if (debug) console.log("after", wantedRecipesStr)

        // keep the same executables...
        throw new RestartProcessingException("Included new recipes " + newRecipes.join(","), wantedRecipesStr);
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

                if (resultFrag.include.initScripts) {
                    if (debug) console.log("Including initscripts...", resultFrag.include.initScripts);
                    await this.includeInitScriptsFromGlob([...resultFrag.include.initScripts], superFragment.sourceFragment.recipe);
                }

                if (resultFrag.include.launchers) {
                    if (debug) console.log("Including launchers...", resultFrag.include.initScripts);
                    await this.includeLauncherScriptsFromGlob([...resultFrag.include.launchers], superFragment.sourceFragment.recipe);
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


}

export class CloudInitExpanderMerger {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly initialRecipes: string[];

    protected readonly initialInitScripts: string[];
    protected currentInitScripts: string[];
    protected readonly initialLaunchers: string[];
    protected currentLaunchers: string[];

    protected runNumber: number = 0;
    protected currentRecipes!: string[];
    protected currentMerger!: CloudInitSuperMerger;

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[], initialInitScripts: string[], initialLaunchers: string[]) {
        this.context = context;
        this.repoResolver = resolver;

        this.initialRecipes = initialRecipes;
        this.currentRecipes = this.initialRecipes;

        this.initialInitScripts = initialInitScripts;
        this.currentInitScripts = initialInitScripts;

        this.initialLaunchers = initialLaunchers;
        this.currentLaunchers = initialLaunchers;
    }

    async process(): Promise<ExpandMergeResults> {
        try {
            await this.processOneYAMLRun(); // will throw as soon as a new recipe is included;

            await this.processOneScriptRun(); // will throw if any scripts are included, but once.

            // since that worked (did not throw), invoke the processor stack; context could modify the processor stack.
            // processor stack CAN'T add new recipes or executables!
            const processedCloudConfig: StandardCloudConfig = await new CloudInitProcessorStack(this.context, this.repoResolver, this.currentMerger.cloudConfig)
                .addDefaultStack()
                .process();

            // Now we resolve the scripts into assets:
            let finalInitScripts = this.currentMerger.initScripts.map(value => this.processLauncherScript(value));
            let finalLauncherDefs = this.currentMerger.launcherScripts.map(value => this.processLauncherScript(value));

            return {
                cloudConfig: this.currentMerger.cloudConfig,
                recipes: this.currentMerger.recipes,
                initScripts: finalInitScripts,
                launcherDefs: finalLauncherDefs,
                processedCloudConfig: processedCloudConfig
            } as ExpandMergeResults;

        } catch (e) {
            if (debug) console.log("Thrown!")
            if (e instanceof RestartProcessingException) {
                let rep: RestartProcessingException = e;
                if (debug) console.log(`Thrown RestartProcessingException! :: ${e.message}`)
                this.currentRecipes = rep.wantedRecipes;
                this.currentInitScripts = this.currentMerger.initScripts;
                this.currentLaunchers = this.currentMerger.launcherScripts;
                return await this.process();
            }
            throw e;
        }
    }


    private processLauncherScript(script: string): IExecutableScript {
        let parsed: path.ParsedPath = path.parse(script);
        let extension = path.extname(script);
        //console.log("scirpt", script, "ext", extension);
        let renderPath = (extension == ".sh") ? "bash/" : "js/"; // @TODO: really? bad...
        return ({
            launcherName: parsed.name,
            assetPath: `${renderPath}${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}${parsed.ext}`
        });
    }


    private async processOneYAMLRun(): Promise<void> {
        this.runNumber++;
        if (debug) console.group("Single run number " + this.runNumber);
        try {
            // Recipes: expand according to TOML rules.
            let resolvedCurrentRecipes: Recipe[] = await (new CloudInitFlatRecipeExpanderFromRecipeDefs(this.context, this.repoResolver, this.currentRecipes)).expand();
            if (debug) await console.log("Expanded list", resolvedCurrentRecipes.map(value => value.id));

            // Executables: expand according to TOML rules from the recipes.
            let recipeInitScripts: string[] = await resolvedCurrentRecipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_initscripts));
            let recipeLaunchers: string[] = await resolvedCurrentRecipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_launchers));

            // Mix-in the initial ones;
            let initialInitScripts: string[] = [...new Set([...recipeInitScripts, ...this.currentInitScripts])];
            let initialLauncherScripts: string[] = [...new Set([...recipeLaunchers, ...this.currentLaunchers])];

            // @TODO: process the executables to get new recipes? and throw.

            this.currentMerger = new CloudInitSuperMerger(this.context, this.repoResolver, resolvedCurrentRecipes, initialInitScripts, initialLauncherScripts);
            await this.currentMerger.evaluateAndMergeAll();

        } finally {
            if (debug) console.groupEnd();
        }
    }

    private async processOneScriptRun() {
        let newInitScripts = this.currentMerger.initScripts.filter(oneCurrentScript => !this.currentInitScripts.includes(oneCurrentScript));
        if (newInitScripts.length > 0) {
            throw new RestartProcessingException("New initscripts included: " + newInitScripts.join(","), this.currentMerger.recipes.map(value => value.id));
        }

        let newLauncherScripts = this.currentMerger.launcherScripts.filter(oneCurrentScript => !this.currentLaunchers.includes(oneCurrentScript));
        if (newLauncherScripts.length > 0) {
            throw new RestartProcessingException("New launcherscripts included: " + newLauncherScripts.join(","), this.currentMerger.recipes.map(value => value.id));
        }
    }
}
