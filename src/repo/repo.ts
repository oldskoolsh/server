import TOML from "@iarna/toml";
import {IRepoDescriptor, IRepoRecipe, IRepoUsesDescriptor} from "./descriptor";
import {RepoResolver} from "./resolver";
import {Recipe} from "./recipe";
import {PathRepoReference} from "./reference";
import YAML from 'yaml';

export class Repository {
    public name: string | undefined;
    public desc: string | undefined;

    rawRecipes: IRepoRecipe[] = [];
    recipes: Recipe[] = [];
    recipesById: Map<string, Recipe> = new Map<string, Recipe>();

    rawUsesRef: IRepoUsesDescriptor[] = [];
    uses: Repository[] = [];

    private readonly myRef: PathRepoReference;
    private readonly myResolver: RepoResolver;

    constructor(myRef: PathRepoReference, myResolver: RepoResolver) {
        this.myRef = myRef;
        this.myResolver = myResolver;
    }

    async readTomlDescriptor(): Promise<Repository> {
        let tomlString = await this.myRef.readFileContents("oldskool.toml");
        // @ts-ignore
        let descriptor: IRepoDescriptor = TOML.parse(tomlString);

        await this.convertToYamlDescriptor(descriptor);
        await this.convertToTomlDescriptor(descriptor);

        //console.log("TOML", toml);
        this.name = descriptor.name;
        this.desc = descriptor.desc;
        if (descriptor.uses) {
            for (let usesKey of Object.keys(descriptor.uses)) {
                let rawRef = descriptor.uses[usesKey];
                rawRef.id = usesKey;
                this.rawUsesRef.push(rawRef);
            }
        }

        if (descriptor.recipes) {
            for (let recipeName of Object.keys(descriptor.recipes)) {
                let recipe: IRepoRecipe = descriptor.recipes[recipeName];
                recipe.id = recipeName;

                this.rawRecipes.push(recipe);
            }
        }

        //console.log("Final TOML Recipe parsed", this);
        return this;
    }

    async recursivelyResolve() {
        //await console.log(`recursivelyResolve '${this.myRef.id}'...`);
        //await console.group();
        try {
            await this.readTomlDescriptor();
            await this.processRecipes();
            // for each rawUsesRef, resolve it as well...
            for (let rawUseRef of this.rawUsesRef) {
                let childRef = new PathRepoReference(this.myRef, rawUseRef);
                let childRepo = new Repository(childRef, this.myResolver);
                await childRepo.recursivelyResolve();
                this.uses.push(childRepo);
            }
            // once done with it release it
            this.rawUsesRef = [];
        } finally {
            //await console.groupEnd();
            //await console.log(`done recursivelyResolve '${this.myRef.id}'...`)
        }
    }

    // @TODO: syntax, if (let ..) would help here
    async recursivelyGetRawAsset(assetPath: string, encoding: string = 'utf8'): Promise<string | null> {
        let myOwn = await this.ownGetAssetOrNull(assetPath, encoding);
        if (myOwn) return myOwn;

        for (const usedRepo of this.uses) {
            let childAsset = await usedRepo.recursivelyGetRawAsset(assetPath, encoding);
            if (childAsset) {
                return childAsset;
            }
        }
        //console.warn(`Could not find asset ${assetPath} anywhere - at '${this.name}', children: ${this.uses.map(value => `${value.desc}'`).join(", ")}`);
        return null;
    }

    async ownGetAssetOrNull(assetPath: string, encoding: string = 'utf8'): Promise<string | null> {
        try {
            return await this.myRef.readFileContents(assetPath, encoding);
        } catch (err) {
            return null;
        }
    }

    // the ordering could be important and i'm not sure of Map semantics
    async recursivelyGetFullFlatRecipeList(): Promise<Map<string, Recipe>> {
        let map: Map<string, Recipe> = new Map<string, Recipe>();
        // add all from our children first
        for (const module of this.uses) {
            let child = await module.recursivelyGetFullFlatRecipeList();
            child.forEach((value, key) => map.set(key, value));
        }
        // then our own
        this.recipesById.forEach((value, key) => map.set(key, value));
        return map;
    }

    public async globOwnScripts(value: string): Promise<string[]> {
        return await this.myRef.globScripts(value);
    }

    public async globOwnJS(value: string): Promise<string[]> {
        return await this.myRef.globJavaScripts(value);
    }

    private async processRecipes() {
        // explicitly-defined recipes loaded from toml first.
        // we aggregate a list of ids for all "mentioned" yamls at this module level
        for (const rawRecipe of this.rawRecipes) {
            let recipe = new Recipe(rawRecipe, this);
            this.recipes.push(recipe);
        }
        // complement with yamls that have no definition automatically
        for (const autoAddId of await this.calcAutoRecipesFromYamls()) {
            this.recipes.push(new Recipe(this.createDefaultRecipeForYaml(autoAddId), this));
        }
        // for easy lookups keep the map updated;
        for (let recipe of this.recipes) {
            this.recipesById.set(recipe.id, recipe);
        }
    }

    private async calcAutoRecipesFromYamls() {
        let mentionedYamls = new Set<string>(this.recipes.flatMap(recipe => recipe.getMentionedYamls()));
        // now glob the ci dir, find yamls that are not already of the mentioned, and create recipes with the default values for them
        let existingYamls: string[] = await this.myRef.getCloudInitYamlFiles();
        let toAutoAdd: string[] = existingYamls.filter(value => !mentionedYamls.has(value));
        return toAutoAdd;
    }

    private createDefaultRecipeForYaml(yamlId: string): IRepoRecipe {
        return {
            auto_js_launchers: [],
            node_version: "latest",
            always_include: false,
            auto_initscripts: [],
            auto_launchers: [],
            expand: [],
            include_if_not_recipe: [],
            include_if_recipe: [],
            id: yamlId,
            virtual: false,
            yaml: yamlId
        };
    }

    private async convertToYamlDescriptor(toml: IRepoDescriptor) {
        let yamlStr = YAML.stringify(toml, {});
        await this.myRef.writeFileContents("oldskool.yaml", yamlStr);
    }

    private async convertToTomlDescriptor(toml: IRepoDescriptor) {
        let tomlStr = TOML.stringify(<any>toml);
        await this.myRef.writeFileContents("oldskool.rewritten.toml", tomlStr);
    }
}


export interface IRepoRef {
    readFileContents(relativePath: string): Promise<string>;
}
