import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import {MimeTextFragment} from "../shared/mime";

export class JBangScriptAsset extends BaseAsset {

    accepts(fileName: string): boolean {
        return [".java", ".jsh"].includes(path.extname(fileName));
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        let mainScript: string = `#!/bin/bash
        ## **INCLUDE:jbang_launchers.sh
        set -e\n`;

        // get the actual path
        let mainJBang: IAssetInfo = await this.repoResolver.getAssetInfo(`${this.assetPath}`);

        // prepare base dir
        mainScript += `jbangLauncherPrepareDir "${mainJBang.name}"\n`;
        // write them all, via base64

        // render from here. otherwise too heavy!
        mainScript = (await (new BashScriptAsset(this.context, this.repoResolver, "jbang_runner_" + this.assetPath)).renderFromString(mainScript)).body;


        mainScript += `mkdir -p "$JBANG_LAUNCHER_DIR/${mainJBang.mkdirName}"; \n`;
        mainScript += `echo '${mainJBang.base64contents}' | base64 --decode > "$JBANG_LAUNCHER_DIR/${mainJBang.name}"; \n`;

        mainScript += `jbangLauncherPrepareJBang "${mainJBang.name}" "0.55.2" \n`;


        // run!
        mainScript += `jbangLauncherDoLaunch "${mainJBang.name}" "$@" \n`;

        return new MimeTextFragment("text/x-shellscript", this.assetPath, mainScript);
    }

}
