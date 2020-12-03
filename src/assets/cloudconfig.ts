import {BaseAsset} from "./base_asset";
import {MimeTextFragment} from "../shared/mime";
import {ExpandMergeResults} from "../schema/results";
import YAML from "yaml";
import {StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudConfigAsset extends BaseAsset {
    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        return await this.renderFromObj();
    }

    public async renderFromObj(): Promise<MimeTextFragment> {
        let finalResults: ExpandMergeResults = await this.context.getExpandedMergedResults();
        let body: string = "";
        //body += `## template: jinja\n`; // @TODO: remove, not used in the real stage. (should not even be used on gather)
        body += `#cloud-config\n`;
        body += `# final recipes: ${finalResults.recipes.map(value => value.id).join(", ")} \n`;
        let cloudConfig: StandardCloudConfig = this.processCloudConfig(finalResults.processedCloudConfig);
        body += YAML.stringify(cloudConfig);
        return new MimeTextFragment("text/cloud-config", this.assetPath, body);
    }

    protected processCloudConfig(cloudConfig: StandardCloudConfig): StandardCloudConfig {
        return cloudConfig;
    }
}

export class GatherCloudConfigAsset extends CloudConfigAsset {

    protected processCloudConfig(cloudConfig: StandardCloudConfig): StandardCloudConfig {
        let curlDatas = [
            `--data-urlencode "osg_ci_arch=$(cloud-init query -f "{{machine}}")"`,
            `--data-urlencode "osg_ci_os=$(cloud-init query -f "{{distro}}")"`,
            `--data-urlencode "osg_ci_release=$(cloud-init query -f "{{distro_release}}")"`,
            `--data-urlencode "osg_ci_cloud=$(cloud-init query -f "{{cloud_name}}")"`,
            `--data-urlencode "osg_ci_platform=$(cloud-init query -f "{{platform}}")"`,
            `--data-urlencode "osg_ci_az=$(cloud-init query -f "{{availability_zone}}")"`,
            `--data-urlencode "osg_ci_region=$(cloud-init query -f "{{region}}")"`,
            `--data-urlencode "osg_ci_iid=$(cloud-init query -f "{{instance_id}}")"`,
            `--data-urlencode "osg_ci_sys_plat=$(cloud-init query -f "{{system_platform}}")"`,
            `--data-urlencode "osg_ci_kernel=$(cloud-init query -f "{{kernel_release}}")"`,
            `--data-urlencode "osg_ci_iid=$(cloud-init query -f "{{instance_id}}")"`,
            `--data-urlencode "osg_os_arch=$(arch || true) "`,
            `--data-urlencode "osg_os_ci_version=$(cloud-init --version || true)"`,
            `--data-urlencode "osg_os_release_pairs=$(cat /etc/os-release | grep -e "_ID" -e "VERSION" -e "NAME" | grep -v -i -e "http" | sed -e 's/\\"//g' | tr "\\n" ";" || true) "`,
            `--data-urlencode "osg_cpu_info=$(cat /proc/cpuinfo | grep -i -e model -e "^revision" | sort | uniq | head -3 | cut -d ":" -f 2 | xargs || true) "`,
            `--data-urlencode "osg_cpu_serial=$(cat /proc/cpuinfo  | grep -e "^Serial" | cut -d ":" -f 2 | xargs || true) "`,
            `--data-urlencode "osg_ip2_intf=$(ip route s | grep "^default" | cut -d " " -f 5 || true)"`,
            `--data-urlencode "osg_ip2_addr=$(ip addr show dev $(ip route s | grep "^default" | cut -d " " -f 5 || true) scope global up | grep inet | tr -s " " | cut -d " " -f 3 | xargs || true)"`,
            //`--data-urlencode ""`,
        ]

        // --http1.1 is unsupported on old versions

        let origBootCmds = cloudConfig.bootcmd || [];
        origBootCmds.unshift(
            `echo OldSkool initting from curl  --silent --show-error --user-agent "$(curl --version | head -1 || true); OldSkool-Gather/0.66.6; $(cloud-init --version || true)" --output "/var/lib/cloud/instance/cloud-config.txt" -G ${curlDatas.join(" ")} ${this.context.recipesUrl}/real/cloud/init/yaml`,
            "cp /var/lib/cloud/instance/cloud-config.txt /var/lib/cloud/instance/cloud-config.txt.orig",
            `sleep 2`,
            `curl --silent --show-error --user-agent "$(curl --version | head -1 || true); OldSkool-Gather/0.66.6; $(cloud-init --version || true)" --output "/var/lib/cloud/instance/cloud-config.txt" -G ${curlDatas.join(" ")} "${this.context.recipesUrl}/real/cloud/init/yaml"`,
            `sleep 2`,
            "echo Done, continuing..."
        );
        cloudConfig.bootcmd = origBootCmds;
        return cloudConfig;
    }
}
