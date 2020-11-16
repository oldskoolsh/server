import {TedisPool} from "tedis";
import {Recipe} from "../repo/recipe";
import {RepoResolver} from "../repo/resolver";
import parser from "ua-parser-js";
import {BaseOS, IOS, IOSRelease} from "./os";
import {Asn, City} from '@maxmind/geoip2-node';
import {GeoIpReaders} from "../shared/geoip";
import {BaseArch, IArch} from "./arch";
import {BaseCloud, ICloud} from "./cloud";

export class RenderingContext {

    public readonly baseUrl: string;
    public moduleUrl!: string;
    public recipesUrl!: string;
    public readonly tedisPool: TedisPool;
    public recipes: Recipe[] = [];
    public paramKV: ReadonlyMap<string, string> = new Map<string, string>();
    public resolver!: RepoResolver;
    public recipeNames: string[] = [];
    public assetRender: boolean = false;
    public assetRenderPath: string = "";
    public bashUrl: string = "wrongbashpath";
    public paramsQS: ReadonlyMap<string, string> = new Map<string, string>();
    public jsUrl: string = "wrongjspath";
    public userAgentStr: string | undefined;
    public clientIP!: string;
    private readonly geoipReaders: GeoIpReaders;
    private _os!: IOS;
    private _release!: IOSRelease;
    private _ua!: IUAParser.IResult;
    private _arch!: IArch;
    private _asn!: Asn;
    private _city!: City;
    private _cloud!: ICloud;

    constructor(baseUrl: string, tedisPool: TedisPool, geoipReaders: GeoIpReaders) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
        this.geoipReaders = geoipReaders;
    }

    public async getUserAgent() {
        if (this._ua) return this._ua;
        this._ua = new parser.UAParser(this.userAgentStr).getResult();
        return this._ua;
    }

    public async getOS(): Promise<IOS> {
        if (this._os) return this._os;
        let os: string | undefined = this.paramsQS.get("cios");
        if (!os) os = this.paramKV.get("os");
        if (!os) os = "ubuntu";
        this._os = BaseOS.createOS(os);
        return this._os;
    }

    public async getRelease(): Promise<IOSRelease> {
        if (this._release) return this._release;
        let release: string | undefined = this.paramsQS.get("cirelease");
        if (!release) release = this.paramKV.get("release");
        if (!release) release = "focal"; // @TODO: latest released lts..
        this._release = (await this.getOS()).getRelease(release);
        return this._release;
    }


    async init() {
    }

    async deinit() {
    }

    public async resolveASNGeoIP(): Promise<Asn> {
        if (this._asn) return this._asn;
        this._asn = this.geoipReaders.asn.asn(this.clientIP);
        return this._asn;
    }

    public async resolveCityGeoIP(): Promise<City> {
        if (this._city) return this._city;
        this._city = this.geoipReaders.city.city(this.clientIP);
        return this._city;
    }

    public async getAllVariables(): Promise<Map<string, string>> {
        let map = new Map<string, string>();

        // stuff from os/release.
        map.set("closest_lower_lts", (await this.getOS()).getClosestLowerLTS(await this.getRelease()).id);
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
        map.set("cpu_raw", this.paramsQS.get("cicpu") || "unknown");
        map.set("default_route_intf", this.paramsQS.get("ciintf") || "unknown");
        map.set("default_route_ip", this.paramsQS.get("ciintip") || "unknown");
        map.set("instance_id", this.paramsQS.get("ciiid") || "unknown");

        // stuff from cloud / elquicko

        return map;
    }

    async getClientIP(): Promise<string> {
        return this.clientIP;
    }

    public async getArch() {
        if (this._arch) return this._arch;
        let arch: string | undefined = this.paramsQS.get("ciarch");
        if (!arch) arch = this.paramKV.get("arch");
        if (!arch) arch = "amd64";
        this._arch = BaseArch.createArch(arch);
        return this._arch;
    }

    async getCloud(): Promise<ICloud> {
        if (this._cloud) return this._cloud;
        let cloud: string | undefined = this.paramsQS.get("ciplatform");
        if (!cloud) cloud = this.paramKV.get("cloud");
        if (!cloud) cloud = "amd64";
        this._cloud = BaseCloud.createCloud(cloud);
        return this._arch;
    }
}

