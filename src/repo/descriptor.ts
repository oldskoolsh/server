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
    auto_launchers: string[];
    auto_initscripts: string[];
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
