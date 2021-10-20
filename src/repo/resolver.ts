import {Repository} from "./repo";
import path from "path";
import {PathRepoReference} from "./reference";
import {Recipe} from "./recipe";

export interface IAssetInfo {
    timestapModified: number;
    name: string,
    base64contents: string,
    mkdirName: string,
    pathOnDisk: string,
    containingDir: string,
}

export class RepoResolver {

    private readonly rootRef: PathRepoReference;
    private readonly rootRepo: Repository;

    constructor(basePath: string, thisPath: string) {
        console.log("RepoResolver: will resolve basePath:", basePath, "thisPath:", thisPath);
        let resolvedPathRef = path.resolve(basePath, thisPath);
        console.log("RepoResolver: resolved:", resolvedPathRef);
        this.rootRef = new PathRepoReference(undefined, {
            id: "root",
            repo_ref: "",
            path_ref: resolvedPathRef
        });
        this.rootRepo = new Repository(this.rootRef, this);
    }

    async rootResolve(): Promise<Repository> {
        await this.rootRepo.recursivelyResolve();
        return this.rootRepo;
    }


    async getRawAsset(assetPath: string, encoding: string = 'utf8'): Promise<string> {
        let asset = await this.rootRepo.recursivelyGetRawAsset(assetPath, encoding);
        if (asset === null) throw new Error(`Could not find asset ${assetPath} anywhere!`);
        return asset;
    }

    async getAssetInfo(assetPath: string): Promise<IAssetInfo> {
        let asset = await this.rootRepo.recursivelyGetAssetInfo(assetPath);
        if (asset === null) throw new Error(`Could not find asset ${assetPath} anywhere!`);
        return asset;
    }

    async getFullFlatRecipeList(): Promise<Map<string, Recipe>> {
        return await this.rootRepo.recursivelyGetFullFlatRecipeList();
    }

    getGithubRootRepoOwner() {
        return "rpardini"; // @TODO: implement
    }

}

