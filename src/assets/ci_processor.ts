import {RenderingContext} from "./context";
import {RepoResolver} from "../repo/resolver";

export class BaseYamlProcessor {
    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;
    protected readonly src: any;

    constructor(context: RenderingContext, resolver: RepoResolver, srcYaml: any) {
        this.context = context;
        this.repoResolver = resolver;
        this.src = srcYaml;
    }

}

export class CloudInitYamlProcessorAptSources extends BaseYamlProcessor {
    async process(): Promise<any> {
        if (!this.src["apt_sources"]) return this.src;
        // store, and remove from return
        let orig_sources = this.src["apt_sources"];
        delete this.src["apt_sources"];
        //console.log(orig_sources);

        let handled = await Promise.all(orig_sources.map(async (value: any) => await this.handleAptSource(value)));

        if (handled.length > 0) {
            this.src["apt"] = this.src["apt"] || {};
            this.src["apt"]["sources"] = this.src["apt"]["sources"] || {};
            let counter = 1;
            for (let handledSource of handled) {
                this.src["apt"]["sources"][`source_${counter++}`] = handledSource;
            }
        }

        return this.src;
    }

    private async handleAptSource(sourceDef: any): Promise<any> {
        return {"source": sourceDef["source"], "filename": sourceDef["filename"], key: "anykey..."};
    }
}
