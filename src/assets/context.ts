import {TedisPool} from "tedis";
import {Recipe} from "../repo/recipe";
import {RepoResolver} from "../repo/resolver";

export class RenderingContext {

    public readonly baseUrl: string;
    public moduleUrl!: string;
    public readonly tedisPool: TedisPool;
    public recipes: Recipe[] = [];
    public paramKV: Map<string, string> = new Map<string, string>();
    public resolver!: RepoResolver;

    constructor(baseUrl: string, tedisPool: TedisPool) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
    }

    async init() {

    }

    async deinit() {
    }

}

