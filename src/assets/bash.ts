import {BaseAsset} from "./base_asset";
import replaceAsync from "string-replace-async";
import * as path from "path";
import {MimeTextFragment} from "../shared/mime";

const includeRegex = /## \*\*INCLUDE:(.+)/gm;
const envDefaultRegex = /## \*\*ENV_DEFAULT:(.+):(.+)/gm;
const escapedIncludeRegex = /## \*\*ESCAPEDINCLUDE:(.+)/gm;
const scriptNameRegex = /##\*\*SCRIPTNAME\*\*##/gm;
const baseUrlRegex = /##\*\*BASEURL\*\*##/gm;
const staticFileBase64Regex = /##\*\*STATICFILEBASE64:(.+)\*\*##/gm;

export class BashScriptAsset extends BaseAsset {

    async renderFromFile(): Promise<MimeTextFragment> {
        return await this.doRenderFromString(await this.repoResolver.getRawAsset(`${this.assetPath}`));
    }

    async renderFromString(str: string): Promise<MimeTextFragment> {
        return await this.doRenderFromString(str);
    }

    accepts(fileName: string): boolean {
        return path.extname(fileName) === ".sh";
    }

    private async doRenderFromString(read: string): Promise<MimeTextFragment> {
        let replaced = read;
        // resolve the extracted includes in a loop, so includes' includes are included
        let loopCounter = 0;
        let hasReplaced = true;
        let includeOnceMap: Set<string> = new Set<string>();
        while (hasReplaced) {
            loopCounter++;
            hasReplaced = false;
            replaced = await replaceAsync(replaced, includeRegex, (async (substring, includedRef) => {
                if (!includeOnceMap.has(includedRef)) {
                    hasReplaced = true;
                    let included = await this.repoResolver.getRawAsset(`scripts/${includedRef}`); // @TODO: include path?
                    includeOnceMap.add(includedRef);
                    return `\n## <OldSkoolInclude:${includedRef}>\n` + included + `\n## </OldSkoolInclude:${includedRef}>\n`;
                } else {
                    return `## </OldSkoolIncludeSkippedBecauseAlreadyIncluded:${includedRef}\n`;
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

        // 4) more fun, part of a bash preprocessor stuff almost
        replaced = await replaceAsync(replaced, envDefaultRegex, async (substring, varName, defaultValue) => {
            return this.bashEnvDefaultPreprocessor(varName, defaultValue)
        });


        // a fun feature, transform bash_XXXX=YYYY querystring parameters into
        // export OLDSKOOL_XXXX="YYYY"
        const vars = Array.from(this.context.getPrefixedQueryStringParams("bash_"))
            .map(value => `# from ?bash_${value[0]} query string\nexport OLDSKOOL_${value[0].trim().toUpperCase()}="${value[1]}";`)
            .join("\n") + "\n\n";


        // @TODO: also fun, transform context variables into OLDSKOOL_CONTEXT_xxx=yyyy

        const shebang: String = "#!/bin/bash\nset -e\n\n";
        return new MimeTextFragment("text/x-shellscript", this.assetPath, shebang + vars + replaced);
    }

    private async bashEnvDefaultPreprocessor(varName: string, defaultValue: string) {
        return `declare ${varName}_DEFAULT=${defaultValue} # Default specified: '${defaultValue}' 
export ${varName}="\${${varName}:-\${${varName}_DEFAULT}}"
logDebug "{${varName}}: '\${${varName}}'  [DEFAULT: '\${${varName}_DEFAULT}']"
[[ ".\${${varName}}." != ".\${${varName}_DEFAULT}." ]] && logInfo "{${varName}}: '\${${varName}}' [overridden default: '\${${varName}_DEFAULT}']"\n`;
    }
}
