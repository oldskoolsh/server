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
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import {MimeTextFragment} from "../shared/mime";

export class JSScriptAsset extends BaseAsset {

    private realMainJS!: IAssetInfo;
    private isJavaScript: boolean = false;
    private isTypeScript: boolean = false;
    private hasProvidedPackageJson: boolean = false;

    accepts(fileName: string): boolean {
        return [".js", ".mjs", ".ts"].includes(path.extname(fileName));
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        let mainScript: string = `## **INCLUDE:js_launchers.sh\n`;

        // get the actual path
        let mainJS: IAssetInfo = await this.repoResolver.getAssetInfo(`${this.assetPath}`);

        // get other JS resources relative to that path. what about resolver hierarchy?
        let otherAssets: IAssetInfo[] = await this.getAllAssetInfoInDir(mainJS.containingDir,
            //    ['**/*.js', '**/*.mjs', '**/*.ts', '**/*.json'] // slower.
            ['**/*.(js|mjs|ts|json)'] // faster
        );

        let assetNames: Map<string, IAssetInfo> = new Map<string, IAssetInfo>();
        otherAssets.forEach(value => assetNames.set(value.name, value));

        // re-find main asset to get correct path assignment
        this.realMainJS = otherAssets.filter(value => value.pathOnDisk === mainJS.pathOnDisk)[0];
        this.isJavaScript = this.realMainJS.name.endsWith(".js") || this.realMainJS.name.endsWith(".mjs");
        this.isTypeScript = this.realMainJS.name.endsWith(".ts");

        // get the package.json if it is included in the assets.
        let existingPackageJson = otherAssets.filter((value: IAssetInfo) => value.name === "package.json" && value.mkdirName === ".");
        let hasPackageLock = otherAssets.some((value: IAssetInfo) => value.name === "package-lock.json" && value.mkdirName === ".");

        if (this.isTypeScript) {
            let hasOwnTsConfig = otherAssets.some((value: IAssetInfo) => value.name === "tsconfig.json" && value.mkdirName === ".");
            if (!hasOwnTsConfig) {
                otherAssets.push(await this.forgeTsConfig());
            }
        }

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
        mainScript = (await (new BashScriptAsset(this.context, this.repoResolver, "js_runner_" + this.assetPath)).renderFromString(mainScript)).body;

        allAssets.forEach((asset: IAssetInfo) => {
            mainScript += `mkdir -p "$JS_LAUNCHER_DIR/${asset.mkdirName}"; \n`;
            mainScript += `echo '${asset.base64contents}' | base64 --decode > "$JS_LAUNCHER_DIR/${asset.name}"; \n`;
        })

        // install/use NVM
        // @TODO: (node version, nvm version) configurable (recipe? or root repo?)
        mainScript += `jsLauncherPrepareNVM "${this.realMainJS.name}" "v15.3.0" "v0.37.2" \n`;
        // npm install, or npm ci
        mainScript += `jsLauncherNPMInstall "${this.realMainJS.name}" "${hasPackageLock ? "ci" : "install"}" \n`;
        // run!
        mainScript += `jsLauncherDoLaunch "${this.realMainJS.name}" "$@" \n`;

        return new MimeTextFragment("text/x-shellscript", this.assetPath, mainScript);
    }


    private async forgeTsConfig(): Promise<IAssetInfo> {
        return {
            containingDir: "",
            mkdirName: ".",
            base64contents: Buffer.from(JSON.stringify({
                "compilerOptions": {
                    "target": "ES2019",
                    "module": "commonjs",
                    "lib": [
                        "ES2019",
                        "ES2020.String"
                    ],
                    "sourceMap": true,
                    "outDir": "dist",
                    "strict": true,
                    "esModuleInterop": true,
                    "skipLibCheck": true,
                    "forceConsistentCasingInFileNames": true
                }
            })).toString("base64"),
            name: "tsconfig.json",
            pathOnDisk: "",
            timestapModified: 0
        };
    }

    private async forgePackageJson(src: any): Promise<IAssetInfo> {
        let scripts: any = src.scripts || {};
        let dependencies: any = src.dependencies || {};

        scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && node $OLDSKOOL_ROOT/${this.realMainJS.name}`;
        if (!this.hasProvidedPackageJson) dependencies["shelljs"] = "~0.8";

        if (this.isTypeScript) {
            //scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && node -r $OLDSKOOL_ROOT/node_modules/ts-node/register $OLDSKOOL_ROOT/${this.realMainJS.name}`;
            scripts[this.realMainJS.name] = `cd $OLDSKOOL_PWD && ts-node --project $OLDSKOOL_ROOT/tsconfig.json $OLDSKOOL_ROOT/${this.realMainJS.name}`;
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
            pathOnDisk: "",
            timestapModified: 0
        };
    }
}
