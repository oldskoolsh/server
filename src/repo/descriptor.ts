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

export interface IRepoUsesDescriptor {
    id: string;
    repo_ref: string;
    path_ref: string;
}

export interface IRepoRecipe {
    id: string;
    yaml: string;
    //launchers: IRecipeLaunchersMap | null | undefined;
    always_include: boolean;
    include_if_not_recipe: string[];
    include_if_recipe: string[];
    virtual: boolean;
    expand: string[];
    auto_initscripts: string[];
    auto_bootscripts: string[];
    auto_launchers: string[];
    node_version: string;
}

/*

export interface IRecipeLauncher {
    id: string;
    script: string;
}
*/

export interface IRepoUsesMap {
    [name: string]: IRepoUsesDescriptor
}

export interface IRecipesMap {
    [name: string]: IRepoRecipe
}

/*
export interface IRecipeLaunchersMap {
    [name: string]: IRecipeLauncher;
}
*/


export interface IRepoDescriptor {
    name: string;
    desc: string;
    uses: IRepoUsesMap;
    recipes: IRecipesMap;
}
