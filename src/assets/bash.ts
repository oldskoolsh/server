import {BaseAsset} from "./base_asset";
import replaceAsync from "string-replace-async";

const includeRegex = /##\ \*\*INCLUDE:(.+)/gm;
const escapedIncludeRegex = /##\ \*\*ESCAPEDINCLUDE:(.+)/gm;
const scriptNameRegex = /##\*\*SCRIPTNAME\*\*##/gm;
const baseUrlRegex = /##\*\*BASEURL\*\*##/gm;
const staticFileBase64Regex = /##\*\*STATICFILEBASE64\:(.+)\*\*##/gm;

export class BashScriptAsset extends BaseAsset {

    async renderFromFile(): Promise<string> {
        return await this.doRenderFromString(await this.repoResolver.getRawAsset(`scripts/${this.assetPath}`));
    }

    async renderFromString(str: string): Promise<string> {
        return await this.doRenderFromString(str);
    }

    private async doRenderFromString(read: string) {
        let replaced = read;
        // resolve the extracted includes in a loop, so includes' includes are included. lol
        let loopCounter = 0;
        let hasReplaced = true;
        let includeOnceMap: Set<string> = new Set<string>();
        while (hasReplaced) {
            loopCounter++;
            hasReplaced = false;
            replaced = await replaceAsync(replaced, includeRegex, (async (substring, includedRef) => {
                if (!includeOnceMap.has(includedRef)) {
                    hasReplaced = true;
                    let included = await this.repoResolver.getRawAsset(`scripts/${includedRef}`);
                    includeOnceMap.add(includedRef);
                    return `\n## <OldSkoolInclude:${includedRef}>\n` + included + `\n## </OldSkoolInclude:${includedRef}>\n`;
                } else {
                    return `## </OldSkookIncludeSkippedBecauseAlreadyIncluded:${includedRef}\n`;
                }
            }));
            replaced = await replaceAsync(replaced, escapedIncludeRegex, (async (substring, includedRef) => {
                hasReplaced = true;
                return (await this.repoResolver.getRawAsset(`scripts/${includedRef}`)).replace(/\$/g, "\\$");
            }));
            if (loopCounter > 10) {
                throw new Error(`Too many include levels in ${this.assetPath}`);
            }
        }

        // once all includes are resolved we can replace more stuff.
        // comes to mind:
        // 1) the BASEURL thing, which will come from the context.
        replaced = await replaceAsync(replaced, baseUrlRegex, async (substring, args) => {
            return this.context.moduleUrl;
        })

        // 2) SCRIPTNAME thing, which should always be this.assetPath
        replaced = await replaceAsync(replaced, scriptNameRegex, async (substring, args) => {
            return this.assetPath;
        })

        // 3) some STATICASSET thing, which should base64-encode or similar (.toprc case)
        replaced = await replaceAsync(replaced, staticFileBase64Regex, (async (substring, includedRef) => {
            return await this.repoResolver.getRawAsset(`assets/${includedRef}`, 'base64');
        }));


        return replaced;
    }
}
