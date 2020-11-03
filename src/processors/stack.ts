import {BaseYamlProcessor} from "./base";
import {RenderingContext} from "../assets/context";
import {RepoResolver} from "../repo/resolver";
import {CloudInitYamlProcessorAptSources} from "./apt_sources";
import {CloudInitYamlProcessorSSHKeys} from "./ssh_keys";
import {CloudInitYamlProcessorAptProxy} from "./proxy";
import {CloudInitYamlProcessorAptMirror} from "./mirror";
import {CloudInitYamlProcessorPackages} from "./packages";
import YAML from 'yaml';

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

    async process(): Promise<string> {
        let obj = this.src;
        for (const processor of this.stack) {
            processor.prepare(this.context, this.repoResolver);
            obj = await processor.process(obj);
        }
        return YAML.stringify(obj);
    }

    addDefaultStack() {
        return this.add(new CloudInitYamlProcessorAptSources())
            .add(new CloudInitYamlProcessorSSHKeys())
            .add(new CloudInitYamlProcessorAptProxy())
            .add(new CloudInitYamlProcessorAptMirror())
            .add(new CloudInitYamlProcessorPackages())
    }
}
