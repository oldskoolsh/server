import {OldSkoolBase} from "./base";
import StatusCodes from "http-status-codes";
import {Express} from "express";
import {RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../assets/context";
import {CloudInitRecipeListExpander} from "../assets/ci_expander";

const {BAD_REQUEST, OK} = StatusCodes;

export abstract class OldSkoolMiddleware extends OldSkoolBase {
    protected uriOwnerRepoCommitish: string = "/:owner/:repo/:commitish";
    protected uriOwnerRepoCommitishRecipes: string = "/:owner/:repo/:commitish/:recipes";
    protected uriNoCloudWithParams: string = "/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud";
    protected uriNoCloudWithoutParams: string = "/:owner/:repo/:commitish/:recipes/dsnocloud";

    addEntranceMiddleware(app: Express) {
        // common middleware for all URLs.
        app.use(`${this.uriOwnerRepoCommitish}`, async (req, res, next) => {
            console.warn("Common middleware START ORC!", req.params);
            // Fake, should come from :owner/:repo/:commitish
            const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
            await resolver.rootResolve();
            req.oldSkoolResolver = resolver;

            // also fake, should come from request datum
            let context = new RenderingContext("https://cloud-init.pardini.net/", this.tedisPool);
            context.moduleUrl = `${context.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
            context.resolver = resolver; // shortcut only
            await context.init();
            req.oldSkoolContext = context;

            next();
        })

        app.use(`${this.uriOwnerRepoCommitish}/bash/:path(*)`, async (req, res, next) => {
            console.warn("Common middleware + BASH!", req.params);
            next();
        });

        app.use(`${this.uriOwnerRepoCommitishRecipes}`, async (req, res, next) => {
            console.warn("Common middleware + RECIPES!", req.params);
            if (!(req.params.recipes === "bash")) { // @TODO: this is horrible. could we NOT?
                // read recipes from request path.
                let initialRecipes: string[] = req.params.recipes.split(",");
                req.oldSkoolContext.recipes = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
            }
            next();
        })

        app.use(`${this.uriNoCloudWithParams}`, async (req, res, next) => {
            console.warn("Common middleware + NOCLOUD WITH PARAMS!", req.params);

            // For oldskool-supported non-clouds (libvirt, hyperkit, hyperv, virtualbox)
            // the correspondent VM-creator script uses the /params/ URL variation.
            // that might include hints for the meta-data generator.

            let paramStr: string = req.params.defaults || "";
            let strKeyValuePairs: string[] = paramStr.split(",");
            let keyValuesPairs: string[][] = strKeyValuePairs.map(value => value.split("=")).filter(value => value.length == 2);
            let parsedKeyVal: { value: string; key: string }[] = keyValuesPairs.map(value => ({
                key: value[0],
                value: value[1]
            }));
            let keyValueMap: Map<string, string> = new Map<string, string>();
            parsedKeyVal.forEach(value => keyValueMap.set(value.key, value.value));

            req.oldSkoolContext.paramKV = keyValueMap;

            next();
        })

        app.use(`${this.uriNoCloudWithoutParams}`, async (req, res, next) => {
            console.warn("Common middleware + NOCLOUD WITHOUT PARAMS", req.params);
            next();
        })

    }


    addExitMiddleware(app: Express) {
        app.use(`${this.uriOwnerRepoCommitishRecipes}`, async (req, res, next) => {
            console.warn("Common middleware END + RECIPES!", req.params);
            next();
        })

        app.use(`${this.uriNoCloudWithParams}`, async (req, res, next) => {
            console.warn("Common middleware END + NOCLOUD WITH PARAMS!", req.params);
            next();
        })

        app.use(`${this.uriNoCloudWithoutParams}`, async (req, res, next) => {
            console.warn("Common middleware END + NOCLOUD WITHOUT PARAMS", req.params);
            next();
        })

        app.use(`${this.uriOwnerRepoCommitish}`, async (req, res, next) => {
            console.warn("Common middleware ORC END!", req.params);
            await req.oldSkoolContext.deinit();
            next();
        })
    }


}
