import {Recipe} from "../repo/recipe";
import {
    IRecipeFragmentDef,
    IRecipeFragmentIfConditionsMap,
    IRecipeFragmentIfDef,
    IRecipeFragmentResultDef,
    IRecipeResultIncludeDef
} from "../repo/recipe_def";

export class CIRecipeFragmentResult implements IRecipeFragmentResultDef {
    and: IRecipeFragmentDef[];
    andIf: IRecipeFragmentIfDef;
    cloudConfig: object;
    include: IRecipeResultIncludeDef;
    message?: string;
    public sourceFragment: CloudConfigSuperFragment;

    constructor(obj: IRecipeFragmentResultDef, srcObj: CloudConfigSuperFragment) {
        this.sourceFragment = srcObj;
        this.include = obj.include || {};
        this.cloudConfig = obj.cloudConfig || {};
        this.message = obj.message;
        this.andIf = new CIRecipeFragmentIf(obj.andIf || {}, this.sourceFragment);
        this.and = obj.and?.map((value: IRecipeFragmentDef) => new CIRecipeFragment(new CIRecipeFragmentIf(value.if, this.sourceFragment), this.sourceFragment)) || [];
    }

}

export class CIRecipeFragmentIf implements IRecipeFragmentIfDef {
    public sourceFragment: CloudConfigSuperFragment;
    public conditions?: IRecipeFragmentIfConditionsMap;

    /**
     * If the conditions all evaluate to true, do this.
     */
    public then?: IRecipeFragmentResultDef;

    /**
     * If any of the conditions evaluate to false, do this.
     */
    public else?: IRecipeFragmentResultDef;

    constructor(obj: IRecipeFragmentIfDef, srcObj: CloudConfigSuperFragment) {
        this.sourceFragment = srcObj;
        //console.log("Creating if for ", obj);
        this.conditions = obj.conditions;
        this.then = obj.then ? new CIRecipeFragmentResult(obj.then, this.sourceFragment) : undefined;
        this.else = obj.else ? new CIRecipeFragmentResult(obj.else, this.sourceFragment) : undefined;
    }
}

export class CIRecipeFragment implements IRecipeFragmentDef {
    if: IRecipeFragmentIfDef;
    sourceFragment: CloudConfigSuperFragment;

    constructor(ifClause: CIRecipeFragmentIf, srcObj: CloudConfigSuperFragment) {
        ifClause.sourceFragment = srcObj;
        this.if = ifClause;
        this.sourceFragment = srcObj;
    }
}

/**
 * Super-fragment is just a YAML Fragment; it abstracts away the "if"
 * syntax, if no "if", just produces a simple non-conditional CIRecipeFragment.
 * otherwise just parses normally.
 */
export class CloudConfigSuperFragment {
    public readonly recipe: Recipe;
    private readonly doc: any;
    private readonly sourceFile: string;
    private readonly fragment: number;

    public sourceRef(): string {
        return `${this.sourceFile}::${this.fragment}`;
    }

    constructor(doc: any, recipe: Recipe, sourceFile: string, fragment: number) {
        this.doc = doc;
        this.recipe = recipe;
        this.sourceFile = sourceFile;
        this.fragment = fragment;
        if (!this.doc) {
            throw new Error("Invalid doc: " + this.sourceFile + " fragment " + fragment);
        }
    }


    async parse(): Promise<CIRecipeFragment> {
        // very naive for now
        if (!this.doc) {
            throw new Error("Invalid doc.");
        }

        if (this.doc["if"]) {
            //console.log(`Got if at ${this.sourceFile}::${this.fragment}`)
            return new CIRecipeFragment(new CIRecipeFragmentIf(this.doc["if"] as IRecipeFragmentIfDef, this), this)
        } else {
            //console.log(`Got no-IF at ${this.sourceFile}::${this.fragment}`)
            return new CIRecipeFragment(new CIRecipeFragmentIf({
                conditions: {},
                then: {cloudConfig: this.doc}
            } as IRecipeFragmentIfDef, this), this)
        }
    }
}
