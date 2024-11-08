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

export interface IOSRelease {
    os: IOS;
    id: string;
    lts: boolean;
    systemd: boolean;
    released: boolean;
    numVersion: number;
    packageManager: string;
}


export interface IOS {
    id: string;
    other_names: string[];
    releases: IOSRelease[]

    getRelease(slug: string): IOSRelease;

    getClosestLowerLTS(release: IOSRelease): IOSRelease;

    getClosestReleased(release: IOSRelease): IOSRelease;

    tryRelease(slugList: string[]): IOSRelease;
}


export abstract class BaseOS implements IOS {
    releases!: IOSRelease[];
    other_names: string[] = [];
    id: string = "unknown";

    public static createOS(id: string): IOS {
        let allOs: IOS[] = [new UnknownOS(), new Ubuntu(), new Debian(), new Fedora(), new AlmaLinux(), new RockyLinux(), new CentOS(), new AmazonLinux()];
        if (!id) return allOs[0];
        let idMatch = allOs.filter(value => value.id === id);
        if (idMatch.length != 1) {
            idMatch = allOs.filter(value => value.other_names.includes(id));
        }
        if (idMatch.length != 1) {
            console.warn(`Unknown OS: '${id}'`);
            return allOs[0];
        }
        return idMatch[0];
    }

    public tryRelease(slugList: string[]): IOSRelease {
        // loop over slugList using getRelease(slug), return the first one is not unknown. if all are unknown, return unknown.
        for (let slug of slugList) {
            console.log(`Trying slug: '${slug}' out of '${slugList.join(", ")}'`)
            let release = this.getRelease(slug);
            if (release.id !== "unknown") {
                console.log(`Found release: '${release.id}' for slug: '${slug}'`);
                return release;
            }
        }
        return this.getRelease(`unknown after trying ${slugList.join(", ")}`);
    }

    getRelease(slug: string): IOSRelease {
        const unknownRelease: IOSRelease = {
            id: "unknown",
            lts: false,
            numVersion: 0,
            os: this,
            released: false,
            systemd: true,
            packageManager: "none"
        };
        // unknown OS has no known releases.
        if (this.id === "unknown") return unknownRelease;

        if (!slug) return unknownRelease;

        let slugMatch = this.releases ? this.releases.filter(value => value.id == slug) : [];
        if (slugMatch.length != 1) {
            // try combining the osName with the release. centos8.
            slugMatch = this.releases ? this.releases.filter(value => value.id == this.id + slug) : [];
        }

        if (slugMatch.length != 1) {
            console.warn(`Unknown release: '${slug}' for os '${this.id}'`);
            return unknownRelease;
        }
        return slugMatch[0];
    }

    public getClosestLowerLTS(release: IOSRelease): IOSRelease {
        const unknownRelease: IOSRelease = {
            id: "unknown",
            lts: false,
            numVersion: 0,
            os: this,
            released: false,
            systemd: true,
            packageManager: "none"
        };
        // unknown OS has no known releases.
        if (this.id === "unknown") return unknownRelease;
        if (release.id === "unknown") return unknownRelease;

        let lowerOrEqualLtsReleases = this.releases ? this.releases
            // lower
            .filter(value => value.numVersion <= release.numVersion)
            // lts
            .filter(value => value.lts) : [];
        if (lowerOrEqualLtsReleases.length < 1) {
            console.warn(`No getClosestLowerLTS than ${release.id} for OS: ${this.id}`);
            return unknownRelease;
        }
        return lowerOrEqualLtsReleases[0];
    }

    public getClosestReleased(release: IOSRelease): IOSRelease {
        const unknownRelease: IOSRelease = {
            id: "unknown",
            lts: false,
            numVersion: 0,
            os: this,
            released: false,
            systemd: true,
            packageManager: "none"
        };
        // unknown OS has no known releases.
        if (this.id === "unknown") return unknownRelease;
        if (release.id === "unknown") return unknownRelease;

        let lowerOrEqualReleasedReleases = this.releases ? this.releases
            // lower or equal...
            .filter(value => value.numVersion <= release.numVersion)
            // lts
            .filter(value => value.released) : [];
        if (lowerOrEqualReleasedReleases.length < 1) {
            console.warn(`No getClosestReleased than ${release.id} for OS: ${this.id}`);
            return unknownRelease;
        }
        return lowerOrEqualReleasedReleases[0];
    }

}


class Ubuntu extends BaseOS implements IOS {
    id: string = "ubuntu";
    releases: IOSRelease[] = [
        {id: "noble", numVersion: 2404, lts: true, released: false, os: this, systemd: true, packageManager: "apt"},
        {id: "mantic", numVersion: 2310, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "lunar", numVersion: 2304, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "kinetic", numVersion: 2210, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "jammy", numVersion: 2204, lts: true, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "impish", numVersion: 2110, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "hirsute", numVersion: 2104, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "groovy", numVersion: 2010, lts: false, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "focal", numVersion: 2004, lts: true, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "bionic", numVersion: 1804, lts: true, released: true, os: this, systemd: true, packageManager: "apt"},
        {id: "xenial", numVersion: 1604, lts: true, released: true, os: this, systemd: true, packageManager: "apt"}
    ];
}

class Debian extends BaseOS implements IOS {
    id: string = "debian";
    releases: IOSRelease[] = [
        {id: "sid", numVersion: 14, lts: false, released: false, systemd: true, os: this, packageManager: "apt"},
        {id: "trixie", numVersion: 13, lts: true, released: false, systemd: true, os: this, packageManager: "apt"},
        {id: "bookworm", numVersion: 12, lts: true, released: true, systemd: true, os: this, packageManager: "apt"},
        {id: "bullseye", numVersion: 11, lts: true, released: true, systemd: true, os: this, packageManager: "apt"},
        {id: "buster", numVersion: 10, lts: true, released: true, systemd: true, os: this, packageManager: "apt"},
        {id: "squeeze", numVersion: 9, lts: true, released: true, systemd: true, os: this, packageManager: "apt"},
    ];
}


class CentOS extends BaseOS implements IOS {
    id: string = "centos";
    other_names: string[] = ['centos linux', 'centos stream'];
    releases: IOSRelease[] = [
        {id: "centos8", numVersion: 8, lts: true, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "centos7", numVersion: 7, lts: true, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "centosstream8", numVersion: 8, lts: true, released: true, systemd: true, os: this, packageManager: "yum"},
        {
            id: "9",
            numVersion: 9,
            lts: true,
            released: false,
            systemd: true,
            os: this,
            packageManager: "yum"
        },
    ];
}

class RockyLinux extends BaseOS implements IOS {
    id: string = "rocky";
    other_names: string[] = ['rockylinux', 'rocky linux'];
    releases: IOSRelease[] = [
        {id: "blue onyx", numVersion: 9, lts: true, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "green obsidian", numVersion: 8, lts: true, released: true, systemd: true, os: this, packageManager: "yum"}
    ];
}

class AlmaLinux extends BaseOS implements IOS {
    id: string = "alma";
    other_names: string[] = ['almalinux', 'alma linux'];
    releases: IOSRelease[] = [
        {id: "seafoam ocelot", numVersion: 9, lts: true, released: true, systemd: true, os: this, packageManager: "yum"}
    ];
}


class Fedora extends BaseOS implements IOS {
    id: string = "fedora";
    other_names: string[] = [];
    releases: IOSRelease[] = [
        {id: "fedora40", numVersion: 40, lts: false, released: false, systemd: true, os: this, packageManager: "yum"},
        {id: "fedora39", numVersion: 39, lts: false, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "fedora38", numVersion: 38, lts: false, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "fedora33", numVersion: 33, lts: false, released: true, systemd: true, os: this, packageManager: "yum"},
        {id: "fedora32", numVersion: 32, lts: false, released: true, systemd: true, os: this, packageManager: "yum"},
    ];
}


class AmazonLinux extends BaseOS implements IOS {
    id: string = "amazonlinux";
    other_names: string[] = ['amazon linux'];
    releases: IOSRelease[] = [
        {id: "amazonlinux2", numVersion: 2, lts: true, released: true, systemd: true, os: this, packageManager: "yum"}
    ];
}


class UnknownOS extends BaseOS implements IOS {
    id: string = "unknown";
}
