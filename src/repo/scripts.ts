import {RenderingContext} from "./context";
import path from "path";

export interface IExecutableScript {
    assetPath: string;
    launcherName: string;
}

export class RecipeExecutablesProcessor {

    public launcherDefs: IExecutableScript[] = [];
    public initScripts!: Array<string>;
    private rc: RenderingContext;

    constructor(rc: RenderingContext) {
        this.rc = rc;
    }

    // real @TODO here is integrate this into the merge recursive logic.
    // scripts are to be read. they can emit new recipes, or just contribute packages/messages
    // if new recipes, re-throw, like yaml

    // super expander uses "initialRecipes", but needs initialScripts
    async process(): Promise<RecipeExecutablesProcessor> {
        // @TODO: do those each in its own promise, Promise.all then
        let launcherScripts = await this.rc.recipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_launchers));
        let bashLaunchers: IExecutableScript[] = this.processLauncherInfo(launcherScripts, "bash/");

        this.initScripts = await this.rc.recipes.asyncFlatMap((recipe) => recipe.getAutoScripts(recipe.def.auto_initscripts));

        // @TODO: js scripts "override"  bash scripts, if two exist with the same name
        let jsScripts = await this.rc.recipes.asyncFlatMap((recipe) => recipe.getAutoJSScripts(recipe.def.auto_js_launchers));
        let jsLaunchers: IExecutableScript[] = this.processLauncherInfo(jsScripts, "js/");


        this.launcherDefs = [...bashLaunchers, ...jsLaunchers];
        return this;

    }

    private processLauncherInfo(scripts: string[], renderPath: string): IExecutableScript[] {
        return scripts.map(value => {
            let parsed: path.ParsedPath = path.parse(value);
            let pathWithExt = `${parsed.dir ? `${parsed.dir}/` : ""}${parsed.name}${parsed.ext}`;
            let launcherName = parsed.name;
            return ({launcherName: launcherName, assetPath: renderPath + pathWithExt});
        });
    }
}
