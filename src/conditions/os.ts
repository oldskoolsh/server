export interface IOSRelease {
    os: IOS;
    id: string;
    lts: boolean;
    systemd: boolean;
    released: boolean;
    numVersion: number;
}


export interface IOS {
    id: string;
    releases: IOSRelease[]

    getRelease(slug: string): IOSRelease;

    getClosestLowerLTS(release: IOSRelease): IOSRelease;
}


export abstract class BaseOS implements IOS {
    releases!: IOSRelease[];
    id: string = "unknown";

    public static createOS(id: string): IOS {
        let allOs: IOS[] = [new UnknownOS(), new Ubuntu(), new Debian()];
        if (!id) return allOs[0];
        let idMatch = allOs.filter(value => value.id === id);
        if (idMatch.length != 1) {
            console.warn(`Unknown OS: '${id}'`);
            return allOs[0];
        }
        return idMatch[0];
    }

    getRelease(slug: string): IOSRelease {
        const unknownRelease = {id: "unknown", lts: false, numVersion: 0, os: this, released: false, systemd: true};
        // unknown OS has no known releases.
        if (this.id === "unknown") return unknownRelease;

        if (!slug) return unknownRelease;

        let slugMatch = this.releases ? this.releases.filter(value => value.id === slug) : [];
        if (slugMatch.length != 1) {
            console.warn(`Unknown release: '${slug}' for os '${this.id}'`);
            return unknownRelease;
        }
        return slugMatch[0];
    }

    public getClosestLowerLTS(release: IOSRelease): IOSRelease {
        const unknownRelease = {id: "unknown", lts: false, numVersion: 0, os: this, released: false, systemd: true};
        // unknown OS has no known releases.
        if (this.id === "unknown") return unknownRelease;

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

}


class Ubuntu extends BaseOS implements IOS {
    id: string = "ubuntu";
    releases: IOSRelease[] = [
        {id: "groovy", numVersion: 2010, lts: false, released: true, os: this, systemd: true},
        {id: "focal", numVersion: 2004, lts: true, released: true, os: this, systemd: true},
        {id: "bionic", numVersion: 1804, lts: true, released: true, os: this, systemd: true},
        {id: "xenial", numVersion: 1604, lts: true, released: true, os: this, systemd: true}
    ];
}

class Debian extends BaseOS implements IOS {
    id: string = "debian";
    releases: IOSRelease[] = [
        {id: "buster", numVersion: 10, lts: true, released: true, systemd: true, os: this},
        {id: "squeeze", numVersion: 9, lts: true, released: true, systemd: true, os: this},
    ];
}


class UnknownOS extends BaseOS implements IOS {
    id: string = "unknown";
}
