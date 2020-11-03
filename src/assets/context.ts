import {Tedis} from "tedis";

export class RenderingContext {

    public readonly baseUrl: string;
    public tedis!: Tedis;
    public moduleUrl!: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    async init() {
        // no auth
        this.tedis = new Tedis({
            port: 6379,
            host: "127.0.0.1"
        });
    }

    async deinit() {
        await this.tedis.close();
    }
}
