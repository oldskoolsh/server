import {Repository} from "./repo";
import path from "path";
import {PathRepoReference} from "./reference";
import {Recipe} from "./recipe";

export class RepoResolver {

    private readonly rootRef: PathRepoReference;
    private readonly rootRepo: Repository;

    constructor(basePath: string, thisPath: string) {
        this.rootRef = new PathRepoReference(undefined, {
            id: "root",
            repo_ref: "",
            path_ref: path.resolve(basePath, thisPath)
        });
        this.rootRepo = new Repository(this.rootRef, this);
    }

    async rootResolve(): Promise<Repository> {
        await this.rootRepo.recursivelyResolve();
        return this.rootRepo;
    }


    async getRawAsset(assetPath: string, encoding: string = 'utf8'): Promise<string> {
        return await this.rootRepo.recursivelyGetRawAsset(assetPath, encoding);
    }

    async getFullFlatRecipeList(): Promise<Map<string, Recipe>> {
        return await this.rootRepo.recursivelyGetFullFlatRecipeList();
    }
}

