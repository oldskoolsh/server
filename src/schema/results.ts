import {Recipe} from "../repo/recipe";
import {ExtendedCloudConfig, StandardCloudConfig} from "./cloud-init-schema";

export interface IExecutableScript {
    assetPath: string;
    callSign: string;
}

export interface IScriptComments {
    recipes: string[];
    /**
     * Important: this are *NOT* blobs! Scripts have no sourceRecipe and thus no glob()
     */
    launcherScripts: string[];
    /**
     * Important: this are *NOT* blobs! Scripts have no sourceRecipe and thus no glob()
     */
    initScripts: string[];
    /**
     * Important: this are *NOT* blobs! Scripts have no sourceRecipe and thus no glob()
     */
    bootScripts: string[];

    /**
     * Packages to be included in cloud-config. @TODO: ubuntu/debian->centos/fedora translation, for example.
     */
    packages: string[];
}

export interface ExpandMergeResults {
    cloudConfig: ExtendedCloudConfig;
    processedCloudConfig: StandardCloudConfig;
    recipes: Recipe[];
    launcherScripts: IExecutableScript[];
    bootScripts: IExecutableScript[];
    initScripts: IExecutableScript[];
}
