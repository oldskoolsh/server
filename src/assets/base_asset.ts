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

import {IAssetInfo, RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../repo/context";
import {MimeTextFragment} from "../shared/mime";
import fg from "fast-glob";
import path from "path";
import fs from "fs";

export abstract class BaseAsset {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly assetPath: string;

    constructor(context: RenderingContext, repoResolver: RepoResolver, assetPath: string) {
        this.context = context;
        this.repoResolver = repoResolver;
        this.assetPath = assetPath;
    }

    public abstract renderFromFile(): Promise<MimeTextFragment>;

    public abstract accepts(fileName: string): boolean;

    protected async oneGlobDir(containingDir: string, glob: string): Promise<string[]> {
        const entries: string[] = await fg([`${glob}`], {cwd: containingDir, dot: false, ignore: ["node_modules/**"]});
        return entries.map(value => `${containingDir}/${value}` /** full path **/);
    }

    protected async getAllAssetInfoInDir(containingDir: string, globs: string[]): Promise<IAssetInfo[]> {
        let allFiles: string[] = await globs.asyncFlatMap(i => this.oneGlobDir(containingDir, i));
        return await allFiles.asyncFlatMap(value => this.assetInfoFromFullPath(value, containingDir));
    }

    protected async assetInfoFromFullPath(pathOnDisk: string, containingDir: string): Promise<IAssetInfo> {
        let name = path.relative(containingDir, pathOnDisk);
        return {
            name: name,
            mkdirName: path.dirname(name),
            containingDir: containingDir,
            pathOnDisk: pathOnDisk,
            base64contents: await fs.promises.readFile(pathOnDisk, {encoding: 'base64'}),
            timestapModified: (await fs.promises.stat(pathOnDisk)).mtimeMs
        }
    }

}
