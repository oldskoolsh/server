import {ExtendedCloudConfig} from "./cloud-init-schema";

export enum IRecipeFragmentIfConditionsConditionEnum {
    os = "os",
    cloud = "cloud",
    release_lts = "release_lts",
    release_init = "release_init",
    release_status = "release_status",
    package_manager = "package_manager",
    ip_resolve = "ip_resolve",
    release = "release",
    geoip_country = "geoip_country",
    geoip_continent = "geoip_continent",
    arch = "arch"
}

export type IRecipeFragmentIfConditionsMap = {
    /**
     * One possible condition.
     */
    [name in IRecipeFragmentIfConditionsConditionEnum]?: string | string[];
};

export interface IRecipeFragmentIfDef {
    /**
     * A map specifying the conditions for this predicate. If none, always evaluates to true.
     */
    conditions?: IRecipeFragmentIfConditionsMap;

    /**
     * If the conditions all evaluate to true, do this.
     */
    then?: IRecipeFragmentResultDef;

    /**
     * If any of the conditions evaluate to false, do this.
     */
    else?: IRecipeFragmentResultDef;
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
    initScripts?: string | string[];
}

export interface IRecipeFragmentResultDef {
    /**
     * Adds a message/explanation of the result. Outputs at the end of the run, at the client side.
     */
    message?: string;

    /**
     * Merge the following object into cloud-config.
     */
    cloudConfig?: ExtendedCloudConfig;

    /**
     * Include more stuff into the context (recipes, initscripts, launchers).
     */
    include?: IRecipeResultIncludeDef;

    /**
     * Continue evaluating (requires a list of recipes)
     */
    and?: IRecipeFragmentDef[];

    /**
     * Continue evaluating (shortcut for a single)
     */
    andIf?: IRecipeFragmentIfDef;

}

export interface IRecipeFragmentDef extends ExtendedCloudConfig {
    /**
     * Entrypoint definition for a recipe.
     */
    if?: IRecipeFragmentIfDef;
}
