import {IRepoUsesDescriptor} from "./descriptor";
import path from "path";
import fs from "fs";
import fg from "fast-glob";

const debug: boolean = true;

export class PathRepoReference {
    id: string;
    basePath: string;
    ownPath: string;
    public readonly tomlRelativePath: string;
    readonly parentRef: PathRepoReference | undefined;
    readonly refDescriptor: IRepoUsesDescriptor;
    private readonly baseDirectory: string;

    constructor(parentReference: PathRepoReference | undefined, refDescriptor: IRepoUsesDescriptor) {
        this.parentRef = parentReference;
        this.refDescriptor = refDescriptor;
        this.id = this.refDescriptor.id;
        // If we have a parent reference, compute the path relative to that.
        if (this.parentRef) {
            this.basePath = this.parentRef.ownPath;
            this.ownPath = this.refDescriptor.path_ref;
        } else {
            this.basePath = this.refDescriptor.path_ref;
            this.ownPath = "";
        }
        let intermediate = path.resolve(this.basePath, this.ownPath);
        if (debug) console.log("intermediate", intermediate);

        if (fs.existsSync(path.resolve(intermediate, ".oldskool"))) {
            this.baseDirectory = path.resolve(intermediate, ".oldskool");
            if (debug) console.log("baseDirectory via .oldskool", this.baseDirectory);
            this.tomlRelativePath = "oldskool.toml";
        } else {
            this.baseDirectory = intermediate;
            if (debug) console.log("baseDirectory via intermediate", this.baseDirectory);
            this.tomlRelativePath = ".oldskool.toml";
        }

        // make sure this exists, but the constructor is definitely not the place to do it
        let stats = fs.statSync(this.baseDirectory);
        if (!stats) {
            throw new Error(`Can't find directory ${this.baseDirectory}`);
        }
    }

    async getFileFullPath(relativePath: string): Promise<string> {
        let fullPath = path.resolve(this.baseDirectory, relativePath);
        if (fs.existsSync(fullPath)) return fullPath;
        throw new Error("Can't find file " + relativePath);
    }

    async readFileContents(relativePath: string, encoding: String = 'utf8'): Promise<string> {
        let fullPath = path.resolve(this.baseDirectory, relativePath);
        switch (encoding) {
            case 'utf8':
                return await fs.promises.readFile(fullPath, {encoding: 'utf8'});
            case 'base64':
                return await fs.promises.readFile(fullPath, {encoding: 'base64'});
            default:
                throw new Error("Unknown encoding " + encoding);
        }
    }

    async resolveGlob(glob: string): Promise<string[]> {
        let scriptsPath = path.resolve(this.baseDirectory);
        const entries: string[] = await fg([`${glob}`], {cwd: scriptsPath, onlyFiles: true, dot: false});
        if (entries.length == 0) throw new Error(`Glob: '${glob}' did not expand.`);
        return entries;
    }


    async getCloudInitYamlFiles(): Promise<string[]> {
        let ciPath = path.resolve(this.baseDirectory, "ci");
        const entries: string[] = await fg([`${ciPath}/**/*.yaml`], {dot: false});
        return entries.map(value => path.basename(value, ".yaml"));
    }

    async writeFileContents(relativePath: string, contents: string) {
        let filePath = path.resolve(this.baseDirectory, relativePath);
        await fs.promises.writeFile(filePath, contents, {encoding: "utf8"});
    }
}
