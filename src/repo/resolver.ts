/*
 * Copyright 2020-2021 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
        //console.log("RepoResolver: will resolve basePath:", basePath, "thisPath:", thisPath);
        let resolvedPathRef = path.resolve(basePath, thisPath);
        //console.log("RepoResolver: resolved:", resolvedPathRef);
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

