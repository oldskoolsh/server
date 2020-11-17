export enum IRecipeIfConditionsConditionEnum {
    os = "os",
    cloud = "cloud",
    release_lts = "release_lts",
    release = "release"
}

export type IRecipeIfConditionsMap = {
    /**
     * One possible condition.
     */
    [name in IRecipeIfConditionsConditionEnum]?: string | string[];
};

export interface IRecipeIfDef {
    /**
     * A map specifying the conditions for this predicate. If none, always evaluates to true.
     */
    conditions?: IRecipeIfConditionsMap;

    /**
     * If the conditions all evaluate to true, do this.
     */
    then?: IRecipeResultDef;

    /**
     * If any of the conditions evaluate to false, do this.
     */
    else?: IRecipeResultDef;
}

export interface IRecipeResultIncludeDef {
    /**
     * Include one or more recipes to the context.
     * If not already included, evaluation will restart with the newly added item.
     */
    recipes?: string | string[];
    /**
     * Include one or more script launchers to the context.
     */
    launchers?: string | string[];
    /**
     * Include one or more initialization scripts to the context.
     */
    initScript?: string | string[];
}

export interface IRecipeResultDef {
    /**
     * Merge the following object into cloud-config.
     */
    cloudConfig?: object;

    /**
     * Include more stuff into the context (recipes, initscripts, launchers).
     */
    include?: IRecipeResultIncludeDef;

    /**
     * Continue evaluating (requires a list of recipes)
     */
    and?: IRecipeDef[];

    /**
     * Continue evaluating (shortcut for a single)
     */
    andIf?: IRecipeIfDef;

}

export interface IRecipeDef {
    /**
     * Entrypoint definition for a recipe.
     */
    if: IRecipeIfDef;
}
