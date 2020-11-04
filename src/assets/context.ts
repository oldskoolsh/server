import {Tedis, TedisPool} from "tedis";

export class RenderingContext {

    public readonly baseUrl: string;
    public moduleUrl!: string;
    public readonly tedisPool: TedisPool;

    constructor(baseUrl: string, tedisPool: TedisPool) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
    }

    async init() {

    }

    async deinit() {
    }

}

