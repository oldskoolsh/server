
export interface IOSRelease {
    os: IOS;
    id: string;
    lts: boolean;
    systemd: boolean;
    released: boolean;
}

export interface IOS {
    id: string;
    releases: IOSRelease[]

    getRelease(slug: string): IOSRelease;
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
}

class Ubuntu extends BaseOS implements IOS {
    id: string = "ubuntu";
    releases: IOSRelease[] = [
        {id: "focal", lts: true, released: true, os: this, systemd: true},
        {id: "groovy", lts: false, released: true, os: this, systemd: true},
        {id: "bionic", lts: true, released: true, os: this, systemd: true}
    ];
}

class Debian extends BaseOS implements IOS {
    id: string = "debian";
    releases: IOSRelease[] = [
        {id: "buster", lts: true, released: true, systemd: true, os: this},
        {id: "squeeze", lts: true, released: true, systemd: true, os: this},
    ];
}
