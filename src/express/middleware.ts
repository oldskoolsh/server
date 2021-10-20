import {OldSkoolBase} from "./base";
import {Express} from "express";
import {RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../repo/context";

const debug = false;
const logClientData = false;

export abstract class OldSkoolMiddleware extends OldSkoolBase {
    protected uriOwnerRepoCommitish: string = "/:owner/:repo/:commitish";
    protected uriOwnerRepoCommitishRecipes: string = "/:owner/:repo/:commitish/:recipes";
    protected uriNoCloudWithParams: string = "/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud";
    protected uriNoCloudWithoutParams: string = "/:owner/:repo/:commitish/:recipes/dsnocloud";

    addEntranceMiddleware(app: Express) {

        // common middleware for all do-something URLs.
        this.middleware(
            [`${this.uriOwnerRepoCommitish}`],
            async (req) => {

                // Fake, should come from :owner/:repo/:commitish
                // Everything under this path is assumed to be public. No secrets should live here
                const resolver = new RepoResolver(process.env.ROOT_BASEPATH ?? "/Users/pardini/Documents/Projects/sk",
                    process.env.ROOT_DIR ?? "oldskool-rpardini");
                await resolver.rootResolve();
                req.oldSkoolResolver = resolver;

                const baseUrl = `${req.secure ? "https://" : "http://"}${req.headers['host']}/`

                //console.dir(req.headers);

                req.oldSkoolContext = new RenderingContext(baseUrl, this.tedisPool, this.geoipReaders, resolver);
                req.oldSkoolContext.userAgentStr = req.headers['user-agent'];
                req.oldSkoolContext.clientIP = req.ip;
                req.oldSkoolContext.paramsQS = this.readParamsQS(req);
                req.oldSkoolContext.moduleUrl = `${req.oldSkoolContext.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
            });

        // first the special case /bash; it does not have recipes; mark as such for the next mw
        this.middleware(
            [
                `${this.uriNoCloudWithParams}/_/:path(*)`,
                `${this.uriOwnerRepoCommitish}/_/:path(*)`
            ],
            async (req) => {
                // Mark as asset render path, so the next handler does not try to resolve recipes.
                (debug) && console.warn("Common middleware (Script/JS, with PARAMS)!");
                req.oldSkoolContext.assetRender = true;
                req.oldSkoolContext.assetRenderPath = req.params.path;
            })


        // read and expand recipes from the path.
        this.middleware(
            [`${this.uriOwnerRepoCommitishRecipes}`],
            async (req) => {
                if (req.oldSkoolContext.assetRender) {
                    return;
                }
                req.oldSkoolContext.initialRecipes = req.params.recipes.split(",");
                req.oldSkoolContext.recipesUrl = req.oldSkoolContext.moduleUrl + "/" + req.params.recipes;
                req.oldSkoolContext.recipesUrlNoParams = req.oldSkoolContext.recipesUrl;
            })

        this.middleware(
            [`${this.uriNoCloudWithParams}`],
            async (req, res) => {
                (debug) && console.warn("Common middleware + NOCLOUD WITH PARAMS!");
                let {paramStr, keyValueMap} = this.readParamKV(req);
                req.oldSkoolContext.paramKV = keyValueMap;
                req.oldSkoolContext.recipesUrl = `${req.oldSkoolContext.recipesUrl}/params/${paramStr}/dsnocloud`;
                // just logging, async
                req.oldSkoolContext.logClientData().then();
            })

        this.middleware(
            [`${this.uriNoCloudWithoutParams}`], async (req, res) => {
                (debug) && console.warn("Common middleware + NOCLOUD WITHOUT PARAMS");
                // set the recipes URL so it keeps on passing the params.
                req.oldSkoolContext.recipesUrl = `${req.oldSkoolContext.recipesUrl}/dsnocloud`;
            })

    }

    addExitMiddleware(app: Express) {
        this.middleware(
            [`${this.uriOwnerRepoCommitish}`], async (req, res) => {
                (debug) && console.warn("Common middleware ORC END!");

                if (logClientData) {
                    req.oldSkoolContext.logClientData().then(value => {
                        if (value) console.warn(`De-initted: ${value}`);
                    }).catch(reason => {
                        console.error("Error during deinit", reason);
                    });
                }

            })
    }

}
