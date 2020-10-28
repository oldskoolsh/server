import path from "path";
import * as fs from "fs";
import TOML from "@iarna/toml";
import {IRecipeLauncher, IRepoDescriptor, IRepoRecipe, IRepoUsesDescriptor} from "./descriptor";
import {RepoResolver} from "./resolver";

export class Repository {
    public name: string | undefined;
    public desc: string | undefined;

    rawRecipes: IRepoRecipe[] = [];
    recipes: Recipe[] = [];

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
        let toml: IRepoDescriptor = TOML.parse(tomlString);
        console.log("TOML", toml);
        this.name = toml.name;
        this.desc = toml.desc;
        if (toml.uses) {
            for (let usesKey of Object.keys(toml.uses)) {
                let rawRef = toml.uses[usesKey];
                rawRef.id = usesKey;
                this.rawUsesRef.push(rawRef);
            }
        }
        if (toml.recipes) {
            for (let recipeName of Object.keys(toml.recipes)) {
                let recipe: IRepoRecipe = toml.recipes[recipeName];
                recipe.id = recipeName;

                if (recipe.launchers) {
                    for (let launcherName of Object.keys(recipe.launchers)) {
                        let launcher: IRecipeLauncher = recipe.launchers[launcherName];
                        launcher.id = launcherName;
                    }
                }
                this.rawRecipes.push(recipe);
            }
        }
        console.log("Final TOML Recipe parsed", this);
        return this;
    }

    async recursivelyResolve() {
        await this.readTomlDescriptor();
        // for each rawUsesRef, resolve it as well...
        for (let rawUseRef of this.rawUsesRef) {
            let childRef = new PathRepoReference(this.myRef, rawUseRef);
            let childRepo = new Repository(childRef, this.myResolver);
            await childRepo.recursivelyResolve();
            this.uses.push(childRepo);
        }

    }

    // whoever has the asset returns it.
    async recursivelyGetRawAsset(assetPath: string, encoding: string = 'utf8'): Promise<string> {
        let myOwn = await this.ownGetAssetOrNull(assetPath, encoding);
        if (myOwn) return myOwn;

        for (const usedRepo of this.uses) {
            let childAsset = usedRepo.recursivelyGetRawAsset(assetPath, encoding);
            if (childAsset) {
                return childAsset;
            }
        }

        throw new Error(`Could not find asset ${assetPath} anywhere!`);
    }

    async ownGetAssetOrNull(assetPath: string, encoding: string = 'utf8'): Promise<string | null> {
        try {
            return await this.myRef.readFileContents(assetPath, encoding);
        } catch (err) {
            return null;
        }
    }

}

export class Recipe {

}

export interface IRepoRef {
    readFileContents(relativePath: string): Promise<string>;
}


export class PathRepoReference implements IRepoRef {
    id: string;
    basePath: string;
    ownPath: string;
    readonly parentRef: PathRepoReference | undefined;
    readonly refDescriptor: IRepoUsesDescriptor;
    private readonly baseDirectory: string;

    constructor(parentReference: PathRepoReference | undefined, refDescriptor: IRepoUsesDescriptor) {
        this.parentRef = parentReference;
        this.refDescriptor = refDescriptor;
        this.id = this.refDescriptor.id;
        // If we have a parent reference, compute the path relative to that.
        if (this.parentRef) {
            this.basePath = this.parentRef.ownPath;
            this.ownPath = this.refDescriptor.path_ref;
        } else {
            this.basePath = this.refDescriptor.path_ref;
            this.ownPath = "";
        }
        let intermediate = path.resolve(this.basePath, this.ownPath);
        console.log("intermediate", intermediate);
        this.baseDirectory = path.resolve(intermediate, ".oldskool");
        console.log("baseDirectory", this.baseDirectory);
        // make sure this exists, but the constructor is definitely not the place to do it
        let stats = fs.statSync(this.baseDirectory);
        if (!stats) {
            throw new Error(`Can't find directory ${this.baseDirectory}`);
        }
    }

    async readFileContents(relativePath: string, encoding: String = 'utf8'): Promise<string> {
        let tomlPath = path.resolve(this.baseDirectory, relativePath);
        switch (encoding) {
            case 'utf8':
                return await fs.promises.readFile(tomlPath, {encoding: 'utf8'});
            case 'base64':
                return await fs.promises.readFile(tomlPath, {encoding: 'base64'});
            default:
                throw new Error("Unknown encoding " + encoding);
        }
    }
}
