import {TedisPool} from "tedis";
import {Recipe} from "../repo/recipe";
import {RepoResolver} from "../repo/resolver";
import parser from "ua-parser-js";

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
    public userAgent: IUAParser.IResult = new parser.UAParser("").getResult();
    public paramsQS: ReadonlyMap<string, string> = new Map<string, string>();
    public jsUrl: string = "wrongjspath";

    constructor(baseUrl: string, tedisPool: TedisPool) {
        this.baseUrl = baseUrl;
        this.tedisPool = tedisPool;
    }

    async init() {
    }

    async deinit() {
    }

}

