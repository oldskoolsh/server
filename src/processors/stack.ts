import {BaseYamlProcessor} from "./base";
import {RenderingContext} from "../assets/context";
import {RepoResolver} from "../repo/resolver";

export class CloudInitProcessorStack {
    protected readonly src: any;
    protected stack: BaseYamlProcessor[] = [];


    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;

    constructor(context: RenderingContext, resolver: RepoResolver, srcYaml: any) {
        this.context = context;
        this.repoResolver = resolver;
        this.src = srcYaml;
    }

    add(item: BaseYamlProcessor) {
        this.stack.push(item);
        return this;
    }

    async process():Promise<any> {
        let obj = this.src;
        for (const processor of this.stack) {
            processor.prepare(this.context, this.repoResolver);
            obj = await processor.process(obj);
        }
        return obj;
    }
}
