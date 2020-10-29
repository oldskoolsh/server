import {IRepoRecipe} from "./descriptor";
import {Repository} from "./repo";

export class Recipe {

    public id: string;
    public def: IRepoRecipe;
    private repo: Repository;

    constructor(rawRecipe: IRepoRecipe, repo: Repository) {
        this.id = rawRecipe.id;
        this.def = rawRecipe;
        this.repo = repo;
    }

    getMentionedYamls(): string[] {
        return [this.def.yaml ? this.def.yaml : this.def.id, "maybe_a_variant"]; // will add to variants later
    }
}
