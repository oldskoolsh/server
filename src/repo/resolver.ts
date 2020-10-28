import {PathRepoReference, Repository} from "./repo";
import path from "path";

export class RepoResolver {

    private readonly rootRef: PathRepoReference;
    private rootRepo: Repository;

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


    async getRawAsset(assetPath: string): Promise<string> {
        return await this.rootRepo.recursivelyGetRawAsset(assetPath);
    }
}

