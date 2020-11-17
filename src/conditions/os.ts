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

export abstract class BaseOS {
    releases!: IOSRelease[];

    public static createOS(id: string): IOS {
        let allOs: IOS[] = [new Ubuntu(), new Debian()];
        let idMatch = allOs.filter(value => value.id === id);
        if (idMatch.length != 1) throw new Error(`Unknown OS: ${id}`)
        return idMatch[0];
    }

    getRelease(slug: string): IOSRelease {
        let slugMatch = this.releases.filter(value => value.id === slug);
        if (slugMatch.length != 1) throw new Error(`Unknown release: ${slug}`);
        return slugMatch[0];
    }

    public getClosestLowerLTS(release: IOSRelease): IOSRelease {
        let lowerOrEqualLtsReleases = this.releases
            // lower
            .filter(value => value.numVersion <= release.numVersion)
            // lts
            .filter(value => value.lts);
        if (lowerOrEqualLtsReleases.length < 1) {
            throw new Error("No getClosestLowerLTS than " + release.id);
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
