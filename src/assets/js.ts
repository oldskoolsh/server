import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";

export class JSScriptAsset extends BaseAsset {

    async renderFromFile(): Promise<string> {

        let mainJS: string = await this.repoResolver.getRawAsset(`js/${this.assetPath}`);

        // get the actual path
        // get other JS resources relative
        // write them all, via base64

        // install/use NVM (node version)
        // npm install
        // run!


        let mainScript = `#!/bin/bash
        ## **INCLUDE:common.sh`; // @TODO: js_runner.sh


        let body = await (new BashScriptAsset(this.context, this.context.resolver, "js_runner_" + this.assetPath)).renderFromString(mainScript);

        return body;
    }

}
