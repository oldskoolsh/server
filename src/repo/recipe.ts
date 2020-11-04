import {IRepoRecipe} from "./descriptor";
import {Repository} from "./repo";
import YAML, {Document} from 'yaml';
import {CloudConfigFragment} from "./cifragment";

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
        return [this.def.yaml ? this.def.yaml : this.def.id/*, "maybe_a_variant"*/]; // will add to variants later
    }

    async getCloudConfigDocs() {
        let allDocs = [];
        for (let mentionedFile of await this.getMentionedYamls()) {
            let rawYaml = await this.repo.recursivelyGetRawAsset(`ci/${mentionedFile}.yaml`) || "";
            let docs: Document.Parsed[] = YAML.parseAllDocuments(rawYaml);
            allDocs.push(...docs.map(value => value.toJS()).map(value => new CloudConfigFragment(value, this, mentionedFile)));
        }
        return allDocs;
    }

    async getAutoScripts(scriptGlobs: string[]): Promise<string[]> {
        if ((!scriptGlobs) || (scriptGlobs.length < 1)) return [];
        let solvedGlobs = (await Promise.all(scriptGlobs.map(value => this.repo.globOwnScripts(value)))).flatMap(value => value);
        //console.log("scriptGlobs:", scriptGlobs, "result", solvedGlobs);
        return solvedGlobs;
    }
}
