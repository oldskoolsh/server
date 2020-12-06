import {BaseAsset} from "./base_asset";
import {MimeTextFragment} from "../shared/mime";
import YAML from "yaml";

export class MetadataAsset extends BaseAsset {
    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        return await this.renderFromString();
    }

    public async renderFromString(): Promise<MimeTextFragment> {
        let cloud = this.context.getSomeParam(["cloud"]) || "nocloud";
        let instanceId = this.context.getSomeParam(["iid"]) || "i-87018aed";
        let hostNameFull = this.context.getSomeParam(["hostname"]) || (`${instanceId}.${cloud}`);
        hostNameFull = hostNameFull.includes(".") ? hostNameFull : `${hostNameFull}.default.domain`;

        let metaData: any = {};
        metaData["cloud"] = `oldskool-${cloud}`; // I don't think this is read anywhere.
        metaData["instance-id"] = instanceId;
        metaData["hostname"] = hostNameFull;
        metaData["local_hostname"] = hostNameFull;
        metaData["availability_zone"] = `${cloud}0`;
        metaData["region"] = `${cloud}`;
        metaData["oldskool"] = this.context.paramKV;

        let yamlString = YAML.stringify(metaData);
        return new MimeTextFragment("text/yaml", this.assetPath, yamlString)

    }
}

export class VendorDataAsset extends BaseAsset {
    accepts(fileName: string): boolean {
        return false;
    }

    async renderFromFile(): Promise<MimeTextFragment> {
        return await this.renderFromString();
    }

    public async renderFromString(): Promise<MimeTextFragment> {
        const prelude: String = `#cloud-config\n# really empty\n`;
        let yamlString = prelude + YAML.stringify({});
        return new MimeTextFragment("text/cloud-config", this.assetPath, yamlString);
    }
}
