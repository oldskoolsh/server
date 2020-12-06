import {BaseAsset} from "./base_asset";
import {BashScriptAsset} from "./bash";
import {IAssetInfo} from "../repo/resolver";
import path from "path";
import {MimeTextFragment} from "../shared/mime";

const gradleDepsRegex = /^(\s)+(compile|compileOnly)(\s)+("|')(.*)("|')/gm;


export class JBangScriptAsset extends BaseAsset {

    accepts(fileName: string): boolean {
        return [".java", ".jsh"].includes(path.extname(fileName));
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        let mainScript: string = `## **INCLUDE:jbang_launchers.sh\n`;

        // get the actual path
        let mainJBang: IAssetInfo = await this.repoResolver.getAssetInfo(`${this.assetPath}`);

        // prepare base dir
        mainScript += `jbangLauncherPrepareDir "${mainJBang.name}"\n`;
        // write them all, via base64

        // render from here. otherwise too heavy!
        mainScript = (await (new BashScriptAsset(this.context, this.repoResolver, "jbang_runner_" + this.assetPath)).renderFromString(mainScript)).body;

        // @TODO: check if there is a pom.xml, in the same dir as the script, or in any of the parents up to the repo root;
        //        if found, parse it (its a XML file), and get the dependencies
        //        re-write those into //DEPS in the main Jbang file.
        //        also repositories? I dunno.
        //        right now
        let gradleBuilds: IAssetInfo[] = await this.getAllAssetInfoInDir(path.dirname(mainJBang.containingDir), ['**/build.gradle']);
        let depsFromPoms: string[] = [...new Set(await gradleBuilds.asyncFlatMap((i: IAssetInfo) => this.parseDepsFromGradle(i)))];

        // get other java files in the same directory, include them as //SOURCES
        let otherAssets: IAssetInfo[] = (await this.getAllAssetInfoInDir(mainJBang.containingDir, ['**/*.java']))
            .filter(value => (value.pathOnDisk != mainJBang.pathOnDisk));

        let mainScriptText = Buffer.from(mainJBang.base64contents, "base64").toString();
        let depComments = depsFromPoms.map(value => `//DEPS ${value}`).join("\n");
        let sourceComments = otherAssets.map(value => `//SOURCES ${value.name}`).join("\n");
        let cacheBuster = otherAssets.map(value => `//MD5of ${value.name} modified ${value.timestapModified}`).join("\n");

        let repoComments = "//REPOS jcenter,jitpack\n";
        let prelude = cacheBuster + "\n" + depComments + "\n" + sourceComments + "\n" + repoComments + "\n";
        console.log("prelude", prelude);
        let newScriptText = prelude + mainScriptText;
        let newScriptTextBase64 = Buffer.from(newScriptText).toString("base64");

        mainScript += `mkdir -p "$JBANG_LAUNCHER_DIR/${mainJBang.mkdirName}"; \n`;
        mainScript += `echo '${newScriptTextBase64}' | base64 --decode > "$JBANG_LAUNCHER_DIR/${mainJBang.name}"; \n`;
        mainScript += `logDebug "Wrote $JBANG_LAUNCHER_DIR/${mainJBang.name}"\n`;

        otherAssets.forEach((asset: IAssetInfo) => {
            mainScript += `mkdir -p "$JBANG_LAUNCHER_DIR/${mainJBang.mkdirName}/${asset.mkdirName}"; \n`;
            mainScript += `echo '${asset.base64contents}' | base64 --decode > "$JBANG_LAUNCHER_DIR/${mainJBang.mkdirName}/${asset.name}"; \n`;
            mainScript += `logDebug "Wrote $JBANG_LAUNCHER_DIR/${mainJBang.mkdirName}/${asset.name}"\n`;
        })

        mainScript += `jbangLauncherPrepareJBang "${mainJBang.name}" "0.55.2" \n`;

        // run!
        mainScript += `jbangLauncherDoLaunch "${mainJBang.name}" "$@" \n`;

        return new MimeTextFragment("text/x-shellscript", this.assetPath, mainScript);
    }

    private async parseDepsFromGradle(asset: IAssetInfo): Promise<string[]> {
        let ret: string[] = [];
        let pomContents = Buffer.from(asset.base64contents, "base64").toString();
        let regExpMatchArrays = pomContents.matchAll(gradleDepsRegex);
        for (const oneMatch of regExpMatchArrays) {
            let depTxt = oneMatch[5].trim();
            console.log("oneMatch:", depTxt);
            ret.push(depTxt)
        }
        return [...new Set(ret)];
    }
}
