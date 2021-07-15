export interface ICloud {
    id: string;
    other_names: string[];
}

export class BaseCloud {
    static createCloud(cloud: string): ICloud {
        let allClouds: ICloud[] = [new UnknownCloud(), new NonCloudCloud(), new DigitalOceanCloud(), new AzureCloud(), new AmazonCloud(), new OracleCloud()];

        if (!cloud) return allClouds[0];

        let idMatch = allClouds.filter(value => value.id === cloud);
        if (idMatch.length != 1) {
            idMatch = allClouds.filter(value => value.other_names.includes(cloud));
        }
        if (idMatch.length != 1) {
            console.warn(`*** Unknown Cloud: '${cloud}'`);
            return allClouds[0]; // unknown
        } else {
            return idMatch[0];
        }
    }
}

export class UnknownCloud extends BaseCloud implements ICloud {
    id = "unknown";
    other_names = []
}

export class NonCloudCloud extends BaseCloud implements ICloud {
    id = "nocloud";
    other_names = ["libvirt", "nocloud"];
}


export class DigitalOceanCloud extends BaseCloud implements ICloud {
    id = "digitalocean";
    other_names = ["configdrive"]; // @TODO: not true. use ASN to determine.
}

export class AzureCloud extends BaseCloud implements ICloud {
    id = "azure";
    other_names = [];
}

export class AmazonCloud extends BaseCloud implements ICloud {
    id = "aws";
    other_names = ["ec2"];
}

export class OracleCloud extends BaseCloud implements ICloud {
    id = "oracle";
    other_names = ["oci"];
}
