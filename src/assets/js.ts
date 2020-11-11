import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import fg from "fast-glob";
import fs from "fs";

export class JSScriptAsset extends BaseAsset {

    private realMainJS!: IAssetInfo;

    async renderFromFile(): Promise<string> {
        let mainScript = `#!/bin/bash
        ## **INCLUDE:js_launchers.sh\n`;

        // get the actual path
        let mainJS: IAssetInfo = await this.repoResolver.getAssetInfo(`js/${this.assetPath}`);
        console.log("mainJS", mainJS);

        // get other JS resources relative to that path. what about resolver hierarchy?
        let otherAssets: IAssetInfo[] = await this.getAllAssetInfoInDir(mainJS.containingDir, ['**/*.js', '**/*.mjs', '**/*.ts', 'package*.json']);

        let assetNames: Map<string, IAssetInfo> = new Map<string, IAssetInfo>();
        otherAssets.forEach(value => assetNames.set(value.name, value));

        // re-find main asset to get correct path assignment
        this.realMainJS = otherAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0];

        // insert package.json as needed.
        let allAssets: IAssetInfo[] = [...otherAssets];
        if (!assetNames.has("package.json")) {
            // forge an asset
            allAssets.push(await this.forgePackageJson())
        }
        console.log("allAssets", allAssets);

        // prepare base dir
        mainScript += `jsLauncherPrepareDir "${allAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0].name}"\n`;
        // write them all, via base64

        allAssets.forEach((asset: IAssetInfo) => {
            mainScript += `mkdir -p "$JS_LAUNCHER_DIR/${asset.mkdirName}"; \n`;
            mainScript += `echo "${asset.base64contents}" | base64 --decode > "$JS_LAUNCHER_DIR/${asset.name}"; \n`;
        })

        // install/use NVM (node version)
        mainScript += `jsLauncherPrepareNVM "${allAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0].name}" "v14.15.0" \n`;
        // npm install
        mainScript += `jsLauncherNPMInstall "${allAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0].name}" \n`;
        // run!
        mainScript += `jsLauncherDoLaunch "${allAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0].name}" $@ \n`;

        let body = await (new BashScriptAsset(this.context, this.context.resolver, "js_runner_" + this.assetPath)).renderFromString(mainScript);
        return body;
    }

    private async getAllAssetInfoInDir(containingDir: string, globs: string[]): Promise<IAssetInfo[]> {
        let allFiles: string[] = await globs.asyncFlatMap(i => this.oneGlobDir(containingDir, i));
        return await allFiles.asyncFlatMap(value => this.assetInfoFromFullPath(value, containingDir));
    }

    private async oneGlobDir(containingDir: string, glob: string): Promise<string[]> {
        const entries: string[] = await fg([`${containingDir}/${glob}`], {dot: false});
        return entries.map(value => value /** full path **/);
    }

    private async assetInfoFromFullPath(pathOnDisk: string, containingDir: string): Promise<IAssetInfo> {
        let name = path.relative(containingDir, pathOnDisk);
        return {
            name: name,
            mkdirName: path.dirname(name),
            containingDir: containingDir,
            pathOnDisk: pathOnDisk,
            base64contents: await fs.promises.readFile(pathOnDisk, {encoding: 'base64'})
        }
    }

    private async forgePackageJson(): Promise<IAssetInfo> {
        let scripts:any = {};
        scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && node $OLDSKOOL_ROOT/${this.realMainJS.name}`;

        let obj = {
            "name": "oldskool-server",
            "description": "autogen",
            "repository": "autogen oldskool",
            "license": "Apache-2.0",
            "version": "0.0.0",
            "scripts": scripts,
            "dependencies": {
                "shelljs": "~0.8"
            },
            "devDependencies": {}
        };

        let forged: string = JSON.stringify(obj);
        return {
            containingDir: "",
            mkdirName: ".",
            base64contents: Buffer.from(forged).toString("base64"),
            name: "package.json",
            pathOnDisk: ""
        };
    }
}
