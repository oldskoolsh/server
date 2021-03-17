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
import {ExpandMergeResults, IExecutableScript, IScriptComments} from "../schema/results";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";
import {BaseAsset} from "../assets/base_asset";
import {AssetFactory} from "../assets/asset_factory";

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
    public bootScripts: string[] = [];

    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;

    constructor(context: RenderingContext, resolver: RepoResolver, recipes: Recipe[], initScripts: string[], launcherScripts: string[], bootScripts: string[]) {
        this.context = context;
        this.repoResolver = resolver;
        this.recipes = recipes;
        this.initScripts = initScripts;
        this.launcherScripts = launcherScripts;
        this.bootScripts = bootScripts;
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
    }


    public async includeBootScriptsFromGlob(possiblyNewExecutables: string[], sourceRecipe: Recipe) {
        if (possiblyNewExecutables.length == 0) return;
        if (debug) console.warn("Should include BOOTSCRIPT", possiblyNewExecutables);
        let possiblyNewExpandedGlobs = await sourceRecipe.expandGlobs(possiblyNewExecutables);
        if (debug) console.warn("resolved included BOOTSCRIPT", possiblyNewExpandedGlobs);
        this.bootScripts = [...new Set([...this.bootScripts, ...possiblyNewExpandedGlobs])];
    }

    public async includeInitScriptsFromGlob(possiblyNewExecutables: string[], sourceRecipe: Recipe) {
        if (possiblyNewExecutables.length == 0) return;
        if (debug) console.warn("Should include INITSCRIPT", possiblyNewExecutables);
        let possiblyNewExpandedGlobs = await sourceRecipe.expandGlobs(possiblyNewExecutables);
        if (debug) console.warn("resolved included INITSCRIPT", possiblyNewExpandedGlobs);
        this.initScripts = [...new Set([...this.initScripts, ...possiblyNewExpandedGlobs])];
    }

    public async includeLauncherScriptsFromGlob(possiblyNewExecutables: string[], sourceRecipe: Recipe) {
        if (possiblyNewExecutables.length == 0) return;
        if (debug) console.warn("Should include LAUNCHERSCRIPT", possiblyNewExecutables);
        let possiblyNewExpandedGlobs = await sourceRecipe.expandGlobs(possiblyNewExecutables);
        if (debug) console.warn("resolved included LAUNCHERSCRIPT", possiblyNewExpandedGlobs);
        this.launcherScripts = [...new Set([...this.launcherScripts, ...possiblyNewExpandedGlobs])];
    }

    public includeRecipeAndThrowIfNotAlreadyIncluded(possiblyNewRecipes: string[], sourceRecipe?: Recipe) {
        let wantedRecipesStr = this.recipes.map(value => value.id); // all the initial...

        if (possiblyNewRecipes.length == 0) return;

        // filter out the recipes we already have...
        let newRecipes = possiblyNewRecipes.filter(possiblyNewRecipeName => !wantedRecipesStr.includes(possiblyNewRecipeName));
        if (newRecipes.length == 0) return;

        let currentRecipeIndex: number = wantedRecipesStr.length;
        if (sourceRecipe) {
            currentRecipeIndex = wantedRecipesStr.indexOf(sourceRecipe.id) + 1;
            if (debug) console.log("splice before", wantedRecipesStr, "index", currentRecipeIndex, "source", sourceRecipe.id);
        }

        for (const recipe of newRecipes) {
            wantedRecipesStr.splice(currentRecipeIndex, 0, recipe);
            currentRecipeIndex++;
        }
        if (debug) console.log("after", wantedRecipesStr)

        // keep the same executables...
        throw new RestartProcessingException("Included new recipes " + newRecipes.join(","), wantedRecipesStr);
    }

    private async recursivelyEvaluate(superFragment: CIRecipeFragmentIf) {
        if (debug) console.group("fragment => ", superFragment.sourceFragment.sourceRef())
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

                if (resultFrag.include.bootScripts) {
                    if (debug) console.log("Including bootScripts...", resultFrag.include.bootScripts);
                    await this.includeBootScriptsFromGlob([...resultFrag.include.bootScripts], superFragment.sourceFragment.recipe);
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
                            try {
                                await impl.prepare();
                            } catch (ex) {
                                console.error(`EXCEPTION during condition prepare(): ${ex.message}`);
                                return false;
                            }
                            try {
                                if (!await impl.evaluate()) {
                                    if (debug) await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, false)
                                    return false;
                                }
                                if (debug) await console.log(`[array] Condition with key '${conditionKey}' and value '${value}' evaluated to`, true)
                                return true;
                            } catch (ex) {
                                console.error(`EXCEPTION during condition evaluate(): ${ex.message}`);
                                return false;
                            }
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

    protected readonly initialBootScripts: string[];
    protected currentBootScripts: string[];

    protected readonly initialLaunchers: string[];
    protected currentLaunchers: string[];

    protected runNumber: number = 0;
    protected currentRecipes!: string[];
    protected currentMerger!: CloudInitSuperMerger;

    protected readonly restartStack: string[] = [];

    constructor(context: RenderingContext, resolver: RepoResolver, initialRecipes: string[], initialInitScripts: string[], initialLaunchers: string[], initialBootScripts: string[]) {
        this.context = context;
        this.repoResolver = resolver;

        this.initialRecipes = initialRecipes;
        this.currentRecipes = this.initialRecipes;

        this.initialInitScripts = initialInitScripts;
        this.currentInitScripts = initialInitScripts;

        this.initialBootScripts = initialBootScripts;
        this.currentBootScripts = initialBootScripts;

        this.initialLaunchers = initialLaunchers;
        this.currentLaunchers = initialLaunchers;
    }

    async process(): Promise<ExpandMergeResults> {
        try {
            await this.processOneYAMLRun(); // will throw as soon as a new recipe is included;

            await this.processOneScriptRun(); // will throw if any scripts are included, but once.

            // Now we resolve the scripts into assets, will throw if any recipes or scripts are included.
            if (debug) console.group("Scripts processing...")
            let finalInitScripts: Array<IExecutableScript> = await this.currentMerger.initScripts.asyncFlatMap(value => this.processLauncherScript(value));
            let finalLauncherScripts: Array<IExecutableScript> = await this.currentMerger.launcherScripts.asyncFlatMap(value => this.processLauncherScript(value));
            let finalBootScripts: Array<IExecutableScript> = await this.currentMerger.bootScripts.asyncFlatMap(value => this.processLauncherScript(value));
            if (debug) console.groupEnd();

            // Just make sure there are no duplicate scripts, otherwise hell will ensue.
            await this.checkUniqueScripts(finalInitScripts, "init");
            await this.checkUniqueScripts(finalLauncherScripts, "launcher");
            await this.checkUniqueScripts(finalBootScripts, "boot");

            // since that worked (did not throw), invoke the processor stack; context could modify the processor stack.
            // processor stack CAN'T add new recipes or executables!
            const processedCloudConfig: StandardCloudConfig = await new CloudInitProcessorStack(this.context, this.repoResolver, this.currentMerger.cloudConfig)
                .addDefaultStack()
                .process();

            return {
                cloudConfig: this.currentMerger.cloudConfig,
                recipes: this.currentMerger.recipes,
                initScripts: finalInitScripts,
                bootScripts: finalBootScripts,
                launcherScripts: finalLauncherScripts,
                processedCloudConfig: processedCloudConfig
            } as ExpandMergeResults;

        } catch (e) {
            if (debug) console.log("Thrown!")
            if (e instanceof RestartProcessingException) {
                this.restartStack.push(e.message);
                let rep: RestartProcessingException = e;
                if (debug) console.log(`Thrown RestartProcessingException! :: ${e.message}`)
                this.currentRecipes = rep.wantedRecipes;
                this.currentInitScripts = this.currentMerger.initScripts;
                this.currentLaunchers = this.currentMerger.launcherScripts;
                this.currentBootScripts = this.currentMerger.bootScripts;
                return await this.process();
            }
            throw e;
        }
    }


    private async processLauncherScript(script: string): Promise<IExecutableScript> {
        let parsed: path.ParsedPath = path.parse(script);

        let assetImpl: BaseAsset = AssetFactory.createAssetByFileName(this.context, this.repoResolver, script);
        let rendered = await assetImpl.renderFromFile(); // this reads it!

        let needs: IScriptComments = await AssetFactory.extractScriptComments(this.repoResolver, script);
        let sourceRecipe: Recipe = this.currentMerger.recipes[0]; // @FIXME: wtf
        if (needs.recipes.length > 0) {
            await this.currentMerger.includeRecipeAndThrowIfNotAlreadyIncluded(needs.recipes, sourceRecipe)
        }
        await this.currentMerger.includeInitScriptsFromGlob(needs.initScripts, sourceRecipe);
        await this.currentMerger.includeLauncherScriptsFromGlob(needs.launcherScripts, sourceRecipe);
        await this.currentMerger.includeBootScriptsFromGlob(needs.bootScripts, sourceRecipe);
        // @TODO: needs.packages!

        let renderPath = "_/";
        return ({
            callSign: parsed.name,
            assetPath: `${renderPath}${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}${parsed.ext}`
        });
    }


    private async processOneYAMLRun(): Promise<void> {
        this.runNumber++;
        if (this.runNumber > 10) {
            throw new Error(`Too many single runs. Sorry.\nRestart stack:\n${this.restartStack.join("\n")}`);
        }
        if (debug) console.group("Single run number " + this.runNumber);
        try {
            // Recipes: expand according to TOML rules.
            let resolvedCurrentRecipes: Recipe[] = await (new CloudInitFlatRecipeExpanderFromRecipeDefs(this.context, this.repoResolver, this.currentRecipes)).expand();
            if (debug) await console.log("Expanded list", resolvedCurrentRecipes.map(value => value.id));

            // Executables: expand according to TOML rules from the recipes.
            let recipeInitScripts: string[] = await resolvedCurrentRecipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_initscripts));
            let recipeBootScripts: string[] = await resolvedCurrentRecipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_bootscripts));
            let recipeLaunchers: string[] = await resolvedCurrentRecipes.asyncFlatMap((recipe) => recipe.expandGlobs(recipe.def.auto_launchers));

            // Mix-in the initial ones, keeping unique
            let initialInitScripts: string[] = [...new Set([...recipeInitScripts, ...this.currentInitScripts])];
            let initialBootScripts: string[] = [...new Set([...recipeBootScripts, ...this.currentBootScripts])];
            let initialLauncherScripts: string[] = [...new Set([...recipeLaunchers, ...this.currentLaunchers])];

            this.currentMerger = new CloudInitSuperMerger(this.context, this.repoResolver, resolvedCurrentRecipes, initialInitScripts, initialLauncherScripts, initialBootScripts);
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

        let newBootScripts = this.currentMerger.bootScripts.filter(oneCurrentScript => !this.currentBootScripts.includes(oneCurrentScript));
        if (newBootScripts.length > 0) {
            throw new RestartProcessingException("New bootscripts included: " + newBootScripts.join(","), this.currentMerger.recipes.map(value => value.id));
        }
    }

    private async checkUniqueScripts(scripts: Array<IExecutableScript>, what: string) {
        let callSignsExisting: Set<string> = new Set<string>();
        let scriptsExisting: Map<string, IExecutableScript> = new Map<string, IExecutableScript>();
        scripts.forEach(value => {
            if (callSignsExisting.has(value.callSign)) {
                let existing = scriptsExisting.get(value.callSign);
                if (existing) {
                    throw new Error(`Duplicate ${what} script: ${value.callSign} (${value.assetPath}) duplicates ${existing.assetPath}`);
                }
            }
            callSignsExisting.add(value.callSign);
            scriptsExisting.set(value.callSign, value);
        });
    }
}
