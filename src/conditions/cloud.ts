/*
 * Copyright 2020-2021 Ricardo Pardini
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

export interface ICloud {
    id: string;
    other_names: string[];
}

export class BaseCloud {
    static createCloud(cloud: string): ICloud {
        let allClouds: ICloud[] = [new UnknownCloud(), new NonCloudCloud(), new DigitalOceanCloud(), new AzureCloud(), new AmazonCloud(), new OracleCloud(), new HetznerCloud()];

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
    other_names = ["libvirt", "nocloud", "configdrive"];
}


export class DigitalOceanCloud extends BaseCloud implements ICloud {
    id = "digitalocean";
    //other_names = ["configdrive"]; // @TODO: not true. use ASN to determine.
    other_names = [];
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

export class HetznerCloud extends BaseCloud implements ICloud {
    id = "hetzner";
    other_names = ["hcloud"];
}
