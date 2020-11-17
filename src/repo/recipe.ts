import {IRepoRecipe} from "./descriptor";
import {Repository} from "./repo";
import YAML, {Document} from 'yaml';
import {CloudConfigSuperFragment} from "../expander_merger/superfragment";

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

    async getCloudConfigDocs(): Promise<CloudConfigSuperFragment[]> {
        let allDocs: CloudConfigSuperFragment[] = [];
        for (let mentionedFile of await this.getMentionedYamls()) {
            let rawYaml: string | null = await this.repo.recursivelyGetRawAsset(`ci/${mentionedFile}.yaml`);
            if ((rawYaml === null) || (rawYaml === "")) {
                console.warn("Got no YAML from " + mentionedFile);
            } else {
                let docs: Document.Parsed[] = YAML.parseAllDocuments(rawYaml);
                try {
                    allDocs.push(...
                        docs
                            .map(value => value.toJS())
                            .filter(value => value != null)
                            .map((value, index) => new CloudConfigSuperFragment(value, this, mentionedFile, index + 1))
                    );
                } catch (e) {
                    throw new Error("Error parsing doc: " + mentionedFile + " :: " + e.message);
                }
            }
        }
        return allDocs;
    }

    async getAutoScripts(scriptGlobs: string[]): Promise<string[]> {
        if ((!scriptGlobs) || (scriptGlobs.length < 1)) return [];
        let solvedGlobs = (await Promise.all(scriptGlobs.map(value => this.repo.globOwnScripts(value)))).flatMap(value => value);
        //console.log("scriptGlobs:", scriptGlobs, "result", solvedGlobs);
        return solvedGlobs;
    }

    async getAutoJSScripts(scriptGlobs: string[]): Promise<string[]> {
        if ((!scriptGlobs) || (scriptGlobs.length < 1)) return [];
        let solvedGlobs = (await Promise.all(scriptGlobs.map(value => this.repo.globOwnJS(value)))).flatMap(value => value);
        //console.log("scriptGlobs:", scriptGlobs, "result", solvedGlobs);
        return solvedGlobs;
    }
}
