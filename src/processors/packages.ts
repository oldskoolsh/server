import {BaseYamlProcessor} from "./base";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudInitYamlProcessorPackages extends BaseYamlProcessor {
    async process(src: ExtendedCloudConfig): Promise<StandardCloudConfig> {
        src.packages = src.packages || [];

        let finalPackages = [];
        let packageSet = new Set<string>();
        for (const packageRef of src.packages) {
            let [packageName, packageVersion] = packageRef.split("=");
            if (!packageSet.has(packageName)) {
                finalPackages.push(packageVersion ? [packageName, packageVersion] : packageName);
                packageSet.add(packageName);
            } else {
                console.warn("Duplicated packageName", packageName);
            }
        }
        src.packages = finalPackages;
        return src;
    }
}
