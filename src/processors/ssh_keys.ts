import {BaseYamlProcessor} from "./ci_processor";
import YAML from 'yaml';

export class CloudInitYamlProcessorSSHKeys extends BaseYamlProcessor {

    async process(): Promise<any> {
        // at both root, and at the user level:

        // read and remove ssh_key_sets = (array, if not, default to default)
        // remove completely any ssh_authorized_keys;

        // unique keyset
        // resolve each keyset (multiple lines, raw or github lookup)
        // unique results
        // console.log("src", this.src)

        let rootLevel = await this.handleKeySetLevel(this.src);
        // clear root
        let root = Object.assign(this.src, await this.handleKeySetLevel({}));
        // new users array with the root user

        let newUsers = [Object.assign({name: "root"}, rootLevel)];
        if ((root.users instanceof Array)) {
            for (const user of root.users) {
                if (user["name"] === "root") continue;
                console.log("user", user);
                newUsers.push(Object.assign(user, await this.handleKeySetLevel(user)));
            }
        }
        root.users = newUsers;

        // root-level is "root" user; so we'll process
        // root
        // every user that is not root;
        // remove from root, insert into root_user


        return root;
    }

    private async handleKeySetLevel(level: any) {
        let finalKeys: string[] | undefined = undefined;
        if (level.ssh_key_sets) {
            if (level.ssh_key_sets instanceof Array) {
                let resolvedSets: string[] = await Promise.all(level.ssh_key_sets.map((set_value: any) => this.resolveKeySet(set_value)));
                let flatSets = resolvedSets.flatMap(value => value);
                let uniqueSets: string[] = [...new Set(flatSets).values()];
                let resolvedKeys: string[][] = await Promise.all(uniqueSets.map(value => this.resolveKey(value)));
                finalKeys = resolvedKeys.flatMap(value => value);
            }
        }
        return {"ssh_authorized_keys": finalKeys, "ssh_key_sets": undefined};
    }

    private async resolveKeySet(keySetName: string): Promise<string[]> {
        console.log("resolving keyset", keySetName);
        let preExpand = await this.getKeysetContents(keySetName);
        return preExpand;
        // await Promise.all(preExpand)
        // .map(keyRef => this.resolveKey(keyRef))
    }

    private async getKeysetContents(keySetName: string): Promise<string[]> {
        try {
            let yamlContents = await this.repoResolver.getRawAsset(`keys/${keySetName}.yaml`);
            return YAML.parse(yamlContents);
        } catch (e) {
            //if (keySetName === "default") {
            return [/*keySetName+"_"+*/this.repoResolver.getGithubRootRepoOwner()];
            //}
            //throw new Error("Can't find " + keySetName)
        }
    }

    private async resolveKey(keyRef: string): Promise<string[]> {
        if (keyRef.length > 30) return [keyRef];

        // do github lookup;
        let body = await this.cachedHTTPRequest(`https://github.com/${keyRef}.keys`, 3600);

        let gitHubLines = body.toString("utf8");
        console.log(gitHubLines);
        let keys = gitHubLines
            .split("\n")
            .map(value => value.trim())
            .filter(value => !(value === ""))
            .map(value => `${value} ${keyRef}'s GitHub key`)
        ;

        return keys;

    }
}
