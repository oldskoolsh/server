export interface IRepoUsesDescriptor {
    id: string;
    repo_ref: string;
    path_ref: string;
}

export interface IRepoUsesMap {
    [name: string]: IRepoUsesDescriptor
}

export interface IRepoDescriptor {
    name: string;
    desc: string;
    uses: IRepoUsesMap;
}
