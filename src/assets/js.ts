import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import fg from "fast-glob";
import fs from "fs";

export class JSScriptAsset extends BaseAsset {

    async renderFromFile(): Promise<string> {

        // get the actual path
        let mainJS: IAssetInfo = await this.repoResolver.getAssetInfo(`js/${this.assetPath}`);
        //console.log("mainJS", mainJS);

        // get other JS resources relative to that path. what about resolver hierarchy?
        let otherAssets: IAssetInfo[] = await this.getAllAssetInfoInDir(mainJS.containingDir, ['**/*.js', '**/*.mjs', '**/*.ts', 'package*.json']);

        let assetNames: Map<string, IAssetInfo> = new Map<string, IAssetInfo>();
        otherAssets.forEach(value => assetNames.set(value.name, value));

        // insert package.json as needed.
        let allAssets: IAssetInfo[] = [...otherAssets];
        if (!assetNames.has("package.json")) {
            // forge an asset
            allAssets.push(await this.forgePackageJson())
        }
        console.log("allAssets", allAssets);


        // write them all, via base64

        // install/use NVM (node version)
        // npm install
        // run!


        let mainScript = `#!/bin/bash
        ## **INCLUDE:common.sh`; // @TODO: js_runner.sh


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
        return {
            name: path.relative(containingDir, pathOnDisk),
            containingDir: containingDir,
            pathOnDisk: pathOnDisk,
            base64contents: await fs.promises.readFile(pathOnDisk, {encoding: 'base64'})
        }
    }

    private async forgePackageJson(): Promise<IAssetInfo> {
        let forged: string = `forged package contents`;
        return {
            containingDir: "",
            base64contents: Buffer.from(forged).toString("base64"),
            name: "fake-package.json",
            pathOnDisk: ""
        };
    }
}
