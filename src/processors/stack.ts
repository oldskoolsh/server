/*
 * Copyright 2020 Ricardo Pardini
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BaseYamlProcessor} from "./base";
import {RenderingContext} from "../repo/context";
import {RepoResolver} from "../repo/resolver";
import {CloudInitYamlProcessorAptSources} from "./apt_sources";
import {CloudInitYamlProcessorSSHKeys} from "./ssh_keys";
import {CloudInitYamlProcessorPackages} from "./packages";
import {CloudInitYamlProcessorReplaceVariables} from "./variables";
import {CloudInitYamlProcessorMessages} from "./messages";
import deepmerge from "deepmerge";
import {ExtendedCloudConfig, StandardCloudConfig} from "../schema/cloud-init-schema";

export class CloudInitProcessorStack {
    protected stack: BaseYamlProcessor[] = [];
    protected inputCloudConfig: ExtendedCloudConfig;

    protected readonly context: RenderingContext;
    protected readonly repoResolver: RepoResolver;

    constructor(context: RenderingContext, resolver: RepoResolver, inputCloudConfig: ExtendedCloudConfig) {
        this.context = context;
        this.repoResolver = resolver;
        this.inputCloudConfig = inputCloudConfig;
    }

    add(item: BaseYamlProcessor) {
        this.stack.push(item);
        return this;
    }

    async process(): Promise<StandardCloudConfig> {
        let obj: ExtendedCloudConfig = deepmerge({}, this.inputCloudConfig); // clone it!
        for (const processor of this.stack) {
            processor.prepare(this.context, this.repoResolver);
            obj = await processor.process(obj);
        }
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

}
