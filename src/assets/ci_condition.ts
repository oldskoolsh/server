import {RenderingContext} from "./context";

export interface ICondition {
    evaluate(): Promise<Boolean>;

    prepare(): Promise<void>;
}

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

abstract class BaseOS {
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

export class BaseCondition {
    protected readonly value: string;
    protected readonly context: RenderingContext;

    constructor(rc: RenderingContext, value: string) {
        this.context = rc;
        this.value = value;
    }

    public static getConditionImplementation(rc: RenderingContext, name: string, value: any) {
        switch (name) {
            case "os":
                return new OSCondition(rc, value);
            case "release":
                return new ReleaseCondition(rc, value);

            case "release_init":
                return new ReleaseInitSystemCondition(rc, value);

            case "release_lts":
                return new UbuntuReleaseLTSCondition(rc, value);

            case "release_status":
                return new UbuntuReleaseStatusCondition(rc, value);
        }
        throw new Error(`Unimplemented condition '${name}'`);
    }

    public async prepare(): Promise<void> {
        // empty
    }

    public async getOS(): Promise<IOS> {
        let os: string | undefined = this.context.paramsQS.get("cios");
        if (!os) os = this.context.paramKV.get("os");
        if (!os) os = "ubuntu";
        return BaseOS.createOS(os);
    }

    public async getRelease(): Promise<IOSRelease> {
        let release: string | undefined = this.context.paramsQS.get("cirelease");
        if (!release) release = this.context.paramKV.get("release");
        if (!release) release = "focal"; // @TODO: latest released lts..
        return (await this.getOS()).getRelease(release);
    }


}

interface IOperator {
    resolve(value: string, actualValue: string): Boolean;
}

export abstract class SimpleValueOperatorCondition extends BaseCondition implements ICondition {

    public async getOperatorFromValue(): Promise<IOperator> {
        if (this.value.startsWith("!=")) return {
            resolve(value: string, actualValue: string): Boolean {
                return value != actualValue;
            }
        };
        return {
            resolve(value: string, actualValue: string): Boolean {
                return value === actualValue;
            }
        };
    }

    public async getValueWithoutOperator(): Promise<string> {
        if (this.value.startsWith("==")) return this.value.substring(2, this.value.length);
        if (this.value.startsWith("!=")) return this.value.substring(2, this.value.length);
        return this.value;
    }

    public async evaluate(): Promise<Boolean> {
        let operator = await this.getOperatorFromValue();
        let value = await this.getValueWithoutOperator();
        let actualValue = await this.getActualValue();
        return operator.resolve(value, actualValue);
    }

    protected abstract async getActualValue(): Promise<string>;
}


class UbuntuReleaseLTSCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.getRelease()).lts ? "lts" : "other";
    }
}

class UbuntuReleaseStatusCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.getRelease()).released ? "released" : "unreleased";
    }
}

export class OSCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        return (await this.getOS()).id;
    }
}

export class ReleaseCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.getRelease()).id;
    }
}

export class ReleaseInitSystemCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.getRelease()).systemd ? "systemd" : "other";
    }
}
