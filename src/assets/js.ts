import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import fg from "fast-glob";
import fs from "fs";

export class JSScriptAsset extends BaseAsset {

    private realMainJS!: IAssetInfo;
    private isJavaScript: boolean = false;
    private isTypeScript: boolean = false;
    private hasProvidedPackageJson: boolean = false;

    async renderFromFile(): Promise<string> {
        let mainScript = `#!/bin/bash
        ## **INCLUDE:js_launchers.sh
        set -e\n`;

        // get the actual path
        let mainJS: IAssetInfo = await this.repoResolver.getAssetInfo(`js/${this.assetPath}`);

        // get other JS resources relative to that path. what about resolver hierarchy?
        let otherAssets: IAssetInfo[] = await this.getAllAssetInfoInDir(mainJS.containingDir,
            //    ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.json'] // slower.
            ['**/*.(js|mjs|ts|json)'] // faster
        );

        let assetNames: Map<string, IAssetInfo> = new Map<string, IAssetInfo>();
        otherAssets.forEach(value => assetNames.set(value.name, value));

        // re-find main asset to get correct path assignment
        this.realMainJS = otherAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0];

        // get the package.json if it is included in the assets.

        let existingPackageJson = otherAssets.filter((value: IAssetInfo) => value.name === "package.json" && value.mkdirName === ".");
        let hasPackageLock = otherAssets.some((value: IAssetInfo) => value.name === "package-lock.json" && value.mkdirName === ".");

        let allAssets: IAssetInfo[] = [];
        if (existingPackageJson.length == 1) {
            // user-provided package.json
            this.hasProvidedPackageJson = true;
            let userSupplierPackageJson = existingPackageJson[0];
            let existingPkgJsonObj = JSON.parse(Buffer.from(userSupplierPackageJson.base64contents, "base64").toString("utf8"));
            allAssets = [await this.forgePackageJson(existingPkgJsonObj), ...otherAssets.filter(value => value != userSupplierPackageJson)];
        } else {
            // forge a new one.
            allAssets = [await this.forgePackageJson({}), ...otherAssets];
        }

        // prepare base dir
        mainScript += `jsLauncherPrepareDir "${allAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0].name}"\n`;
        // write them all, via base64

        // render from here. otherwise too heavy!
        mainScript = await (new BashScriptAsset(this.context, this.context.resolver, "js_runner_" + this.assetPath)).renderFromString(mainScript);

        allAssets.forEach((asset: IAssetInfo) => {
            mainScript += `mkdir -p "$JS_LAUNCHER_DIR/${asset.mkdirName}"; \n`;
            mainScript += `echo '${asset.base64contents}' | base64 --decode > "$JS_LAUNCHER_DIR/${asset.name}"; \n`;
        })

        // install/use NVM
        // @TODO: (node version, nvm version) configurable (recipe? or root repo?)
        mainScript += `jsLauncherPrepareNVM "${this.realMainJS.name}" "v14.15.0" "v0.37.0" \n`;
        // npm install, or npm ci
        mainScript += `jsLauncherNPMInstall "${this.realMainJS.name}" "${hasPackageLock?"ci":"install"}" \n`;
        // run!
        mainScript += `jsLauncherDoLaunch "${this.realMainJS.name}" "$@" \n`;


        return mainScript;
    }

    private async getAllAssetInfoInDir(containingDir: string, globs: string[]): Promise<IAssetInfo[]> {
        let allFiles: string[] = await globs.asyncFlatMap(i => this.oneGlobDir(containingDir, i));
        return await allFiles.asyncFlatMap(value => this.assetInfoFromFullPath(value, containingDir));
    }

    private async oneGlobDir(containingDir: string, glob: string): Promise<string[]> {
        const entries: string[] = await fg([`${glob}`], {cwd: containingDir, dot: false, ignore: ["node_modules/**"]});
        return entries.map(value => `${containingDir}/${value}` /** full path **/);
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

    private async forgePackageJson(src: any): Promise<IAssetInfo> {
        this.isJavaScript = this.realMainJS.name.endsWith(".js") || this.realMainJS.name.endsWith(".mjs");
        this.isTypeScript = this.realMainJS.name.endsWith(".ts");

        let scripts: any = src.scripts || {};
        let dependencies: any = src.dependencies || {};

        scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && node $OLDSKOOL_ROOT/${this.realMainJS.name}`;
        if (!this.hasProvidedPackageJson) dependencies["shelljs"] = "~0.8";

        if (this.isTypeScript) {
            //scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && node -r $OLDSKOOL_ROOT/node_modules/ts-node/register $OLDSKOOL_ROOT/${this.realMainJS.name}`;
            scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && ts-node $OLDSKOOL_ROOT/${this.realMainJS.name}`;
            if (!this.hasProvidedPackageJson) dependencies = {
                ...dependencies, ...{
                    "@types/commander": "~2",
                    "@types/shelljs": "~0.8",
                    "commander": "~6",
                    "ts-node": "~9",
                    "typescript": "~4"
                }
            };
        }

        let overriden = {
            "name": src.name || `oldskool_script_${this.realMainJS.name}`,
            "description": src.description || `oldskool script: ${this.realMainJS.name}`,
            "repository": src.repository || `oldskool script: ${this.realMainJS.name}`,
            "author": src.author || `oldskool author: ${this.realMainJS.name}`,
            "license": src.license || "Apache-2.0",
            "version": src.version || "0.0.0",
            "scripts": scripts,
            "dependencies": dependencies,
        };

        let obj = Object.assign(src, overriden);

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
