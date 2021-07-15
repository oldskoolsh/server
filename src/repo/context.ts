import {TedisPool} from "tedis";
import {RepoResolver} from "./resolver";
import parser, {UAParser} from "ua-parser-js";
import {BaseOS, IOS, IOSRelease} from "../conditions/os";
import {Asn, City} from '@maxmind/geoip2-node';
import {GeoIpReaders} from "../shared/geoip";
import {BaseArch, IArch} from "../conditions/arch";
import {BaseCloud, ICloud} from "../conditions/cloud";

import {createHash} from "crypto";
import * as fs from "fs";
import {ExpandMergeResults} from "../schema/results";
import {CloudInitExpanderMerger} from "../expander_merger/expandermerger";

export class RenderingContext {

    public readonly baseUrl: string;
    public readonly resolver: RepoResolver;
    public moduleUrl!: string;
    public recipesUrlNoParams!: string;
    public recipesUrl!: string;
    public readonly tedisPool: TedisPool;
    public paramKV: ReadonlyMap<string, string> = new Map<string, string>();
    public assetRender: boolean = false;
    public assetRenderPath: string = "";
    public paramsQS: ReadonlyMap<string, string> = new Map<string, string>();
    public userAgentStr: string | undefined;
    public clientIP!: string;
    public initialRecipes?: string[];
    private readonly geoipReaders: GeoIpReaders;
    private _os!: IOS;
    private _release!: IOSRelease;
    private _ua!: UAParser.IResult;
    private _arch!: IArch;
    private _asn!: Asn;
    private _city!: City;
    private _cloud!: ICloud;
    private _expandedMergedResults?: ExpandMergeResults;
    private _requestMetaCI?: any;

    constructor(baseUrl: string, tedisPool: TedisPool, geoipReaders: GeoIpReaders, resolver: RepoResolver) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
        this.geoipReaders = geoipReaders;
        this.resolver = resolver;
    }

    public async getUserAgent() {
        if (this._ua) return this._ua;
        this._ua = new parser.UAParser(this.userAgentStr).getResult();
        return this._ua;
    }

    public async getOS(): Promise<IOS> {
        if (this._os) return this._os;
        let os: string = this.getSomeParam(["os", "ci_meta_distro", "osg_ci_os", "osg_os_release_name", "osg_os_release_cpe_name"]);
        this._os = BaseOS.createOS(os);
        return this._os;
    }

    public async getRelease(): Promise<IOSRelease> {
        if (this._release) return this._release;
        let release: string = this.getSomeParam(["release", "ci_meta_distro_release", "osg_ci_release", "osg_os_release_version_id"]);
        this._release = (await this.getOS()).getRelease(release);
        return this._release;
    }


    // on the end of each request, after its done (client is already served, we dont have req/res anymore)
    // we have time to collect usage information.
    // Redis is still accessible, but I treat it as semi-persistent
    // So for now it writes to disk. The contents are a JSON blob of parts
    // of this Context; the clientIP/userAgent, the paramKV and paramQS.
    async logClientData(): Promise<any> {
        let jsonSer: string = await this.serializeToJSON();
        let hash = createHash('md5').update(jsonSer).digest('hex');
        //console.log(`Got hash ${hash} for ${jsonSer}`);
        let fileName = `${__dirname}/../../data/contexts/${hash}.json`;
        // check if file exists.
        if (fs.existsSync(fileName)) {

        } else {
            await fs.promises.writeFile(fileName, jsonSer, "utf8");
            console.debug(`Wrote new JSON context file '${hash}'`)
        }
    }

    public async resolveASNGeoIP(): Promise<Asn> {
        if (this._asn) return this._asn;
        try {
            this._asn = this.geoipReaders.asn.asn(this.clientIP);
            return this._asn;
        } catch (ex) {
            console.error("Error during GeoIP ASN lookup for address '" + this.clientIP + "': " + ex.message);
            return {} as Asn;
        }
    }

    public async resolveCityGeoIP(): Promise<City> {
        if (this._city) return this._city;
        try {
            this._city = this.geoipReaders.city.city(this.clientIP);
            return this._city;
        } catch (ex) {
            console.error("Error during GeoIP City lookup for address '" + this.clientIP + "': " + ex.message);
            return {} as City;
        }
    }

    public async getAllVariables(): Promise<Map<string, string>> {
        let map = new Map<string, string>();

        // stuff from os/release.
        map.set("closest_lower_lts", (await this.getOS()).getClosestLowerLTS(await this.getRelease()).id);
        map.set("closest_released", (await this.getOS()).getClosestReleased(await this.getRelease()).id);
        map.set("package_manager", (await this.getRelease()).packageManager);
        map.set("release_status", (await this.getRelease()).released ? "released" : "unreleased");
        map.set("release_init", (await this.getRelease()).systemd ? "systemd" : "other");
        map.set("release_lts", (await this.getRelease()).lts ? "lts" : "non-lts");
        map.set("release", (await this.getRelease()).id);
        map.set("os", (await this.getOS()).id);
        map.set("arch", (await this.getArch()).id);
        map.set("cloud", (await this.getCloud()).id);

        // the actual IP that hit this server.
        map.set("outbound_ip", this.clientIP);

        // geoIP, super-expensive...
        map.set("geoip_as_org", (await this.resolveASNGeoIP()).autonomousSystemOrganization || "unknown")
        let city = await this.resolveCityGeoIP();
        map.set("geoip_country", (city.country ? city.country.isoCode || "unknown" : "unknown").toLowerCase())
        map.set("geoip_continent", (city.continent ? city.continent.code || "unknown" : "unknown").toLowerCase())

        // stuff from the gather stage.
        map.set("cpu_raw", this.getSomeParam(["cpu", "osg_cpu_info"]) || "unknown");
        map.set("default_route_intf", this.getSomeParam(["osg_ip2_intf"]) || "unknown");
        map.set("default_route_ip", this.getSomeParam(["osg_ip2_addr"]) || "unknown");
        map.set("instance_id", this.getSomeParam(["iid", "ci_meta_instance_id", "osg_ci_iid"]) || "unknown");

        // stuff from cloud / elquicko

        return map;
    }

    async getClientIP(): Promise<string> {
        return this.clientIP;
    }

    /**
     * Tries: paramsQS, use that unless bogus.
     * Tries paramKV first if found use those unless their bogus.
     * next:
     * subdictionary inside paramsQS, for the /etc/os-release stuff...
     * @param name
     */
    public getOneParam(name: string): string {
        if (this.paramsQS) {
            let value = this.paramsQS.get(name);
            if (!this.isSomeValueBogus(value)) {
                // @ts-ignore
                return <string>value.trim();
            }
        }
        if (this.paramKV) {
            let value = this.paramKV.get(name);
            if (!this.isSomeValueBogus(value)) {
                // @ts-ignore
                return <string>value.trim();
            }
        }
        if (name.startsWith("ci_meta_")) {
            // all cloud-init metadata is in osg_json_ci_meta in a "v1" key, use that
            if ((!this._requestMetaCI) && (this.paramsQS.get("osg_json_ci_meta"))) {
                this._requestMetaCI = JSON.parse(this.paramsQS.get("osg_json_ci_meta") || "")
                this._requestMetaCI = this._requestMetaCI["v1"];
            }
            if ((this._requestMetaCI)) {
                let key = name.substr("ci_meta_".length);
                let value = this._requestMetaCI[key];
                console.log(`ci_meta: ${key}: ${value}`);
                if (!this.isSomeValueBogus(value)) return value;
            }
        }

        // @TODO: refactor + cache.
        if (name.startsWith("osg_os_release_")) {
            // try osg_os_release_pairs in paramsQS;
            let osgOsReleasePairs = this.paramsQS.get("osg_os_release_pairs");
            if (osgOsReleasePairs) {
                const map: Map<string, string> = osgOsReleasePairs
                    .split(";")
                    .map(value => value.trim())
                    .filter(value => value.length > 0)
                    .map(value => value.split("="))
                    .filter(value => value.length == 2)
                    .map(split => ({key: split[0].trim(), value: split[1].trim()}))
                    .filter(value => value && value.value && value.key)
                    .reduce((acc, item) =>
                            acc.set(`osg_os_release_${item.key}`, item.value)
                        , new Map<string, string>());

                let value: string | undefined = map.get(name);
                if (value) {
                    // unquote
                    if (value.startsWith(`"`) && value.endsWith(`"`)) {
                        value = value.substr(1, value.length - 2);
                    }
                    if (!this.isSomeValueBogus(value)) {
                        // @ts-ignore
                        return <string>value.trim();
                    }
                }
            }
        }
        return "";
    }

    public getSomeParam(paramNamesInOrder: string[]): string {
        for (const name of paramNamesInOrder) {
            let val = this.getOneParam(name);
            if (val) return val;
        }
        return "";
    }

    public async getArch() {
        if (this._arch) return this._arch;
        let arch: string = this.getSomeParam(["arch", "ci_meta_machine", "osg_os_arch", "osg_ci_arch"]);
        // there is still chance from the user-agent...
        this._arch = BaseArch.createArch(arch);
        return this._arch;
    }

    async getCloud(): Promise<ICloud> {
        if (this._cloud) return this._cloud;
        let cloud: string = this.getSomeParam(["cloud", "ci_meta_cloud_name", "osg_ci_cloud", "ci_meta_platform", "osg_ci_platform"]);
        this._cloud = BaseCloud.createCloud(cloud);
        return this._cloud;
    }

    public async getExpandedMergedResults(): Promise<ExpandMergeResults> {
        if (!this._expandedMergedResults) this._expandedMergedResults = await
            (new CloudInitExpanderMerger(this, this.resolver, this.initialRecipes ?? [], [], [], []))
                .process();
        return this._expandedMergedResults;
    }

    public async minimalOsReleaseArchQueryString(): Promise<string> {
        let os = await this.getOS();
        let release = await this.getRelease();
        let arch = await this.getArch();
        let pairs = {os: os.id, release: release.id, arch: arch.id};

        return "?" + Object.entries(pairs)
            .map((value: [string, string]) => value[1] === "unknown" ? null : `${value[0]}=${value[1]}`)
            .filter(value => !!value)
            .join("&");

        //return `?os=${os.id}&release=${release.id}&arch=${arch.id}`;
    }

    public getPrefixedQueryStringParams(prefix: string): Map<string, string> {
        let ret: Map<string, string> = new Map<string, string>();
        for (const oneParamQS of this.paramsQS) {
            let key = oneParamQS[0];
            if (key.startsWith(prefix)) {
                let keyWithoutPrefix = key.substr(prefix.length, (key.length - prefix.length));
                ret.set(keyWithoutPrefix, oneParamQS[1]);
                //console.log("Key no prefix", keyWithoutPrefix, "value", oneParamQS[1], ret);
            }
        }
        return ret;
    }

    private isSomeValueBogus(value: string | undefined): boolean {
        if (!value) return true;
        if (!value.trim()) return true;
        if (value.startsWith("ci_missing_jinja_var/")) return true;
        if (value.startsWith("unknown")) return true;
        return false;
    }

    private async serializeToJSON(): Promise<string> {
        let paramsQS1 = Object.fromEntries(this.paramsQS);
        let paramsKV = Object.fromEntries(this.paramKV);
        let obj = {
            clientIP: this.clientIP,
            userAgentStr: this.userAgentStr,
            paramsQS: paramsQS1,
            paramsKV: paramsKV,
        }
        return JSON.stringify(obj, null, 2);
    }
}

