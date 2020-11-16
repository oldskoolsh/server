import {TedisPool} from "tedis";
import {Recipe} from "../repo/recipe";
import {RepoResolver} from "../repo/resolver";
import parser from "ua-parser-js";
import {BaseOS, IOS, IOSRelease} from "./os";

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
    private _os!: IOS;
    private _release!: IOSRelease;
    private _ua!: IUAParser.IResult;

    constructor(baseUrl: string, tedisPool: TedisPool) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
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

    async getAllVariables(): Promise<Map<string, string>> {
        let map = new Map<string, string>();

        // stuff from os/release.
        map.set("closest_lower_lts", (await this.getOS()).getClosestLowerLTS(await this.getRelease()).id);
        map.set("release_status", (await this.getRelease()).released ? "released" : "unreleased");
        map.set("release_init", (await this.getRelease()).systemd ? "systemd" : "other");
        map.set("release_lts", (await this.getRelease()).lts ? "lts" : "non-lts");
        map.set("release", (await this.getRelease()).id);
        map.set("os", (await this.getOS()).id);

        // the actual IP that hit this server.
        map.set("outbound_ip", this.clientIP);

        // stuff from the gather stage.
        map.set("cpu_raw", this.paramsQS.get("cicpu") || "unknown");
        map.set("default_route_intf", this.paramsQS.get("ciintf") || "unknown");
        map.set("default_route_ip", this.paramsQS.get("ciintip") || "unknown");
        map.set("instance_id", this.paramsQS.get("ciiid") || "unknown");

        return map;
    }

    async getClientIP(): Promise<string> {
        return this.clientIP;
    }
}

