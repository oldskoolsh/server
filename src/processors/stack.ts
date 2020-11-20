import {BaseYamlProcessor} from "./base";
import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";
import {CloudInitYamlProcessorAptSources} from "./apt_sources";
import {CloudInitYamlProcessorSSHKeys} from "./ssh_keys";
import {CloudInitYamlProcessorPackages} from "./packages";
import {CloudInitYamlProcessorReplaceVariables} from "./variables";
import {CloudInitYamlProcessorMessages} from "./messages";
import deepmerge from "deepmerge";

export class CloudInitProcessorStack {
    protected stack: BaseYamlProcessor[] = [];
    protected inputCloudConfig: any;

    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;

    constructor(context: RenderingContext, resolver: RepoResolver, inputCloudConfig: any) {
        this.context = context;
        this.repoResolver = resolver;
        this.inputCloudConfig = inputCloudConfig;
    }

    add(item: BaseYamlProcessor) {
        this.stack.push(item);
        return this;
    }

    async process(): Promise<any> {
        let obj = await this.processObj();
        return obj;
    }

    addDefaultStack() {
        return this
            .add(new CloudInitYamlProcessorReplaceVariables())
            .add(new CloudInitYamlProcessorAptSources())
            .add(new CloudInitYamlProcessorSSHKeys())
            .add(new CloudInitYamlProcessorPackages())
            .add(new CloudInitYamlProcessorMessages())
    }

    async processObj(): Promise<any> {
        let obj = deepmerge({}, this.inputCloudConfig);
        for (const processor of this.stack) {
            processor.prepare(this.context, this.repoResolver);
            obj = await processor.process(obj);
        }
        return obj;
    }
}
