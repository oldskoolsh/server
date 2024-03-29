/*
 * Copyright 2020 Ricardo Pardini
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

import {RenderingContext} from "../repo/context";

import util from "util";
import dns from "dns";

const dnsLookup = util.promisify(dns.lookup);

export interface ICondition {
    evaluate(): Promise<Boolean>;

    prepare(): Promise<void>;
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
            case "arch":
                return new NormalizedArchitectureCondition(rc, value);

            case "cloud":
                return new NormalizedCloudCondition(rc, value);

            case "os":
                return new OSCondition(rc, value);

            case "release":
                return new ReleaseCondition(rc, value);

            case "release_init":
                return new ReleaseInitSystemCondition(rc, value);

            case "package_manager":
                return new ReleasePackageManagerCondition(rc, value);

            case "release_lts":
                return new UbuntuReleaseLTSCondition(rc, value);

            case "release_status":
                return new UbuntuReleaseStatusCondition(rc, value);

            case "ip_resolve":
                return new ClientResolvedIPCondition(rc, value);

            case "geoip_country":
                return new GeoIpCountryCondition(rc, value);

            case "geoip_continent":
                return new GeoIpContinentCondition(rc, value);
        }
        throw new Error(`Unimplemented condition '${name}'`);
    }

    public async prepare(): Promise<void> {
        // empty
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
        let value = await this.processValue(await this.getValueWithoutOperator());
        let actualValue = await this.getActualValue();
        return operator.resolve(value, actualValue);
    }

    protected abstract getActualValue(): Promise<string>;

    protected async processValue(value: string): Promise<string> {
        return value;
    }
}


class UbuntuReleaseLTSCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getRelease()).lts ? "lts" : "other";
    }
}

class UbuntuReleaseStatusCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getRelease()).released ? "released" : "unreleased";
    }
}

export class OSCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getOS()).id;
    }
}

export class ReleaseCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getRelease()).id;
    }
}

export class ReleasePackageManagerCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getRelease()).packageManager;
    }
}

export class ReleaseInitSystemCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getRelease()).systemd ? "systemd" : "other";
    }
}

export class ClientResolvedIPCondition extends SimpleValueOperatorCondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getClientIP());
    }

    protected async processValue(value: string): Promise<string> {
        let resolved = await dnsLookup(value, 4);
        return resolved.address;
    }

}


export class NormalizedArchitectureCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getArch()).id;
    }
}

export class NormalizedCloudCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        return (await this.context.getCloud()).id;
    }
}


export class GeoIpCountryCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        let city = await this.context.resolveCityGeoIP();
        return (city.country != undefined ? city.country.isoCode || "unknown" : "unknown").toLowerCase();
    }
}

export class GeoIpContinentCondition extends SimpleValueOperatorCondition implements ICondition {
    protected async getActualValue(): Promise<string> {
        let city = await this.context.resolveCityGeoIP();
        return (city.continent != undefined ? city.continent.code || "unknown" : "unknown").toLowerCase();
    }
}
