import {Recipe} from "./recipe";

export class CloudConfigFragment {
    public recipe: Recipe;
    public condition: any;
    public contents: any;
    private readonly doc: any;
    private sourceFile: string;

    constructor(doc: any, recipe: Recipe, sourceFile: string, fragment: number) {
        this.doc = doc;
        this.recipe = recipe;
        this.sourceFile = sourceFile;
        this.condition = null;
        this.contents = null;

        if (!this.doc) {
            throw new Error("Invalid doc: " + this.sourceFile + " fragment " + fragment);
        }
    }


    async parse(): Promise<CloudConfigFragment> {
        // very naive for now
        if (!this.doc) {
            throw new Error("Invalid doc.");
        }

        if (this.doc["if"]) {
            this.condition = this.doc["if"]["conditions"];
            this.contents = this.doc["if"]["then"]["cloudConfig"];
        } else {
            this.condition = {};
            this.contents = this.doc;
        }
        return this;
    }
}
