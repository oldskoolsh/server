import {BaseAsset} from "./base_asset";
import {IExecutableScript, RecipeExecutablesProcessor} from "../repo/scripts";
import {BashScriptAsset} from "./bash";

export class LaunchersAsset extends BaseAsset {

    async renderFromFile(): Promise<string> {
        let scriptsProcessor = await (new RecipeExecutablesProcessor(this.context)).process();

        let bashPrelude = `#!/bin/bash\n## **INCLUDE:bash_launchers.sh\n`;

        let launchersReinstall = `createLauncherRelauncher "${this.context.recipesUrl}/launchers"\n`;

        let bashTemplate: string =
            scriptsProcessor.launcherDefs.map((value: IExecutableScript) => `createLauncherScript "${value.launcherName}" "${value.assetPath}"`).join("\n") +
            `\n`;

        let allTemplates = bashPrelude + launchersReinstall + bashTemplate;
        let body = await (new BashScriptAsset(this.context, this.repoResolver, this.assetPath)).renderFromString(allTemplates);
        return body;
    }


}
