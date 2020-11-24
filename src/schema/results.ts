import {Recipe} from "../repo/recipe";
import {ExtendedCloudConfig, StandardCloudConfig} from "./cloud-init-schema";

export interface IExecutableScript {
    assetPath: string;
    launcherName: string;
}

export interface ExpandMergeResults {
    cloudConfig: ExtendedCloudConfig;
    processedCloudConfig: StandardCloudConfig;
    recipes: Recipe[];
    launcherDefs: IExecutableScript[];
    initScripts: IExecutableScript[];
}
