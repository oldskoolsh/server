/*
 * Copyright 2020 Ricardo Pardini
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
                // console.debug("Got no YAML from " + mentionedFile);
                continue;
            }
            let docs: Document.Parsed[] = YAML.parseAllDocuments(rawYaml);
            try {
                allDocs.push(...
                    docs
                        .map(value => value.toJS())
                        .filter(value => value != null)
                        .map((value, index) => new CloudConfigSuperFragment(value, this, mentionedFile, index + 1))
                );
            } catch (e:any) {
                throw new Error("Error parsing doc: " + mentionedFile + " :: " + e.message);
            }
        }
        return allDocs;
    }

    async expandGlobs(scriptGlobs: string[]): Promise<string[]> {
        try {
            if ((!scriptGlobs) || (scriptGlobs.length < 1)) return [];
            let solvedGlobs: string[] = (await scriptGlobs.asyncFlatMap(((value: string) => this.repo.resolveGlob(value))));
            return solvedGlobs;
        } catch (e:any) {
            throw new Error(`Could not expand globs: recipe '${this.id}': ${e.message}`);
        }
    }

}
