/*
 * Copyright 2020-2021 Ricardo Pardini
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
