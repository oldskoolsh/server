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

import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IExecutableScript} from "../schema/results";
import {MimeTextFragment} from "../shared/mime";

export class LaunchersAsset extends BaseAsset {

    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        // Yeah, stop using. Get from context.

        let expandedResults = await this.context.getExpandedMergedResults();

        let bashPrelude = `## **INCLUDE:bash_launchers.sh\n`;

        let launchersReinstall = `createLauncherRelauncher "${this.context.recipesUrl}/launchers"\n`;

        let bashTemplate: string =
            expandedResults.launcherScripts.map((value: IExecutableScript) => `createLauncherScript "${value.callSign}" "${value.assetPath}"`).join("\n") +
            `\n`;

        let allTemplates = bashPrelude + launchersReinstall + bashTemplate;
        return await (new BashScriptAsset(this.context, this.repoResolver, this.assetPath)).renderFromString(allTemplates);
    }


}
