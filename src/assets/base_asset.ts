import {RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../repo/context";

export abstract class BaseAsset {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly assetPath: string;

    constructor(context: RenderingContext, repoResolver: RepoResolver, assetPath: string) {
        this.context = context;
        this.repoResolver = repoResolver;
        this.assetPath = assetPath;
    }


    public abstract async renderFromFile(): Promise<string>;

    public abstract accepts(fileName: string): boolean;

}
