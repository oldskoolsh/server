import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IExecutableScript} from "../schema/results";

export class LaunchersAsset extends BaseAsset {

    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<string> {
        // Yeah, stop using. Get from context.

        let expandedResults = await this.context.getExpandedMergedResults();

        let bashPrelude = `#!/bin/bash\n## **INCLUDE:bash_launchers.sh\n`;

        let launchersReinstall = `createLauncherRelauncher "${this.context.recipesUrl}/launchers"\n`;

        let bashTemplate: string =
            expandedResults.launcherScripts.map((value: IExecutableScript) => `createLauncherScript "${value.callSign}" "${value.assetPath}"`).join("\n") +
            `\n`;

        let allTemplates = bashPrelude + launchersReinstall + bashTemplate;
        let body = await (new BashScriptAsset(this.context, this.repoResolver, this.assetPath)).renderFromString(allTemplates);
        return body;
    }


}
