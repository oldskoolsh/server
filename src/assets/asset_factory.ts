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

import {RenderingContext} from "../repo/context";
import {IAssetInfo, RepoResolver} from "../repo/resolver";
import {BashScriptAsset} from "./bash";
import {JSScriptAsset} from "./js";
import {BaseAsset} from "./base_asset";
import {IScriptComments} from "../schema/results";
import {JBangScriptAsset} from "./jbang";

const includeRecipeRegex: RegExp = /^(\s*)(##|\/\/) \*\*RECIPE:(?<recipe>.+)/gm;
const includeInitScriptRegex: RegExp = /^(\s*)(##|\/\/) \*\*INITSCRIPT:(?<script>.+)/gm;
const includeBootScriptRegex: RegExp = /^(\s*)(##|\/\/) \*\*BOOTSCRIPT:(?<script>.+)/gm;
const includeLauncherScriptRegex: RegExp = /^(\s*)(##|\/\/) \*\*LAUNCHER:(?<script>.+)/gm;
const includePackageRegex: RegExp = /^(\s*)(##|\/\/) \*\*PACKAGE:(?<package>.+)/gm;

export class AssetFactory {

    // 🤮
    public static createAssetByFileName(context: RenderingContext, repoResolver: RepoResolver, fileName: string): BaseAsset {
        let impls = [
            new BashScriptAsset(context, repoResolver, fileName),
            new JSScriptAsset(context, repoResolver, fileName),
            new JBangScriptAsset(context, repoResolver, fileName)
        ];
        let impl = impls.filter(value => value.accepts(fileName));
        if (impl.length == 1) return impl[0];
        throw new Error("No asset impl accepts " + fileName);
    }

    public static async extractScriptComments(repoResolver: RepoResolver, fileName: string): Promise<IScriptComments> {
        let mainAsset: IAssetInfo = await repoResolver.getAssetInfo(`${fileName}`);
        let scriptText: string = Buffer.from(mainAsset.base64contents, "base64").toString("utf8");
        // regex galore
        return {
            initScripts: this.extractWithRegex(scriptText, includeInitScriptRegex, "script"),
            launcherScripts: this.extractWithRegex(scriptText, includeLauncherScriptRegex, "script"),
            bootScripts: this.extractWithRegex(scriptText, includeBootScriptRegex, "script"),
            recipes: this.extractWithRegex(scriptText, includeRecipeRegex, "recipe"),
            packages: this.extractWithRegex(scriptText, includePackageRegex, "package")
        } as IScriptComments;
    }

    private static extractWithRegex(subject: string, regex: RegExp, groupName: string): string[] {
        return [...new Set([...subject.matchAll(regex)].map((value: RegExpMatchArray) => ({...value.groups}[groupName])))];
    }

}
