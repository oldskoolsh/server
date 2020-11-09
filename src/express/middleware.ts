import {OldSkoolBase} from "./base";
import StatusCodes from "http-status-codes";
import {Express} from "express";
import {RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../assets/context";
import {CloudInitRecipeListExpander} from "../assets/ci_expander";


// Parse the User-Agent;...
import parser from "ua-parser-js";

import {Query} from "express-serve-static-core";

const {BAD_REQUEST, OK} = StatusCodes;

export abstract class OldSkoolMiddleware extends OldSkoolBase {
    protected uriOwnerRepoCommitish: string = "/:owner/:repo/:commitish";
    protected uriOwnerRepoCommitishRecipes: string = "/:owner/:repo/:commitish/:recipes";
    protected uriNoCloudWithParams: string = "/:owner/:repo/:commitish/:recipes/params/:defaults/dsnocloud";
    protected uriNoCloudWithoutParams: string = "/:owner/:repo/:commitish/:recipes/dsnocloud";

    addEntranceMiddleware(app: Express) {

        //this.middleware(['/'], async (req, res) => {});


        // common middleware for all do-something URLs.
        this.middleware(
            [`${this.uriOwnerRepoCommitish}`],
            async (req, res) => {
                // Fake, should come from :owner/:repo/:commitish
                const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
                await resolver.rootResolve();
                req.oldSkoolResolver = resolver;

                // also fake, should come from request datum
                let context = new RenderingContext("https://cloud-init.pardini.net/", this.tedisPool);

                // parse the real user-agent. this lib is somewhat shit, does not detect wget/curl.
                // so should only be used for detecting actual, human browsers.
                context.userAgent = new parser.UAParser(req.headers['user-agent']).getResult();

                // parse the queryString parameters, with some guarantees:
                // - only one value (the last) if multiple values
                // - undefined if empty or missing.
                let paramsQS:Map<string,string> = new Map<string, string>();
                let qsKey:string;
                let expressQS: Query = req.query;
                for (qsKey of Object.keys(expressQS)) {
                    let qsValue: string | string[] | Query | Query[] | undefined = req.query[qsKey];
                    if (qsValue === undefined) continue;
                    if (qsValue instanceof Array) {
                        let lastArrVal = qsValue[qsValue.length-1]
                        paramsQS.set(qsKey.toLowerCase(), lastArrVal.toString().toLowerCase());
                    } else {
                        paramsQS.set(qsKey.toLowerCase(), qsValue.toString().toLowerCase());
                    }
                }
                context.paramsQS = paramsQS;


                // real stuff
                context.moduleUrl = `${context.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
                context.bashUrl = `${context.moduleUrl}/bash`;
                context.resolver = resolver; // shortcut only
                await context.init();
                req.oldSkoolContext = context;
            });

        // first the special case /bash; it does not have recipes; mark as such for the next mw
        this.middleware(
            [
                `${this.uriNoCloudWithParams}/bash/:path(*)`,
                `${this.uriOwnerRepoCommitish}/bash/:path(*)`
            ],
            async (req, res) => {
                // Mark as asset render path, so the next handler does not try to resolve recipes.
                console.warn("Common middleware (ASSET for BASH, with PARAMS)!");
                req.oldSkoolContext.assetRender = true;
                req.oldSkoolContext.assetRenderPath = req.params.path;
            })


        // read and expand recipes from the path.
        this.middleware(
            [`${this.uriOwnerRepoCommitishRecipes}`],
            async (req, res) => {
                if (req.oldSkoolContext.assetRender) {
                    console.warn("Common middleware + RECIPES (SKIPPED)");
                    return;
                }

                console.warn("Common middleware + RECIPES!");
                // read recipes from request path.
                let initialRecipes: string[] = req.params.recipes.split(",");
                req.oldSkoolContext.recipes = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
                req.oldSkoolContext.recipeNames = req.oldSkoolContext.recipes.map(value => value.id);
                req.oldSkoolContext.recipesUrl = req.oldSkoolContext.moduleUrl + "/" + req.oldSkoolContext.recipeNames.join(",");
            })

        this.middleware(
            [`${this.uriNoCloudWithParams}`],
            async (req, res) => {
                console.warn("Common middleware + NOCLOUD WITH PARAMS!");

                // For oldskool-supported non-clouds (libvirt, hyperkit, hyperv, virtualbox)
                // the correspondent VM-creator script uses the /params/ URL variation.
                // that might include hints for the meta-data generator.

                let paramStr: string = req.params.defaults || "";
                let strKeyValuePairs: string[] = paramStr.split(",");
                let keyValuesPairs: string[][] = strKeyValuePairs.map(value => value.split("=")).filter(value => value.length == 2);
                let parsedKeyVal: { value: string; key: string }[] = keyValuesPairs.map(value => ({
                    key: value[0].toLowerCase(),
                    value: value[1].toLowerCase()
                }));
                let keyValueMap: Map<string, string> = new Map<string, string>();
                parsedKeyVal.forEach(value => keyValueMap.set(value.key, value.value));

                req.oldSkoolContext.paramKV = keyValueMap;

                // set the recipes URL so it keeps on passing the params.
                req.oldSkoolContext.recipesUrl = `${req.oldSkoolContext.recipesUrl}/params/${paramStr}/dsnocloud`;
                req.oldSkoolContext.bashUrl = `${req.oldSkoolContext.recipesUrl}/bash`;

            })

        this.middleware(
            [`${this.uriNoCloudWithoutParams}`], async (req, res) => {
                console.warn("Common middleware + NOCLOUD WITHOUT PARAMS");
                // set the recipes URL so it keeps on passing the params.
                req.oldSkoolContext.recipesUrl = `${req.oldSkoolContext.recipesUrl}/dsnocloud`;
            })

    }


    addExitMiddleware(app: Express) {
        this.middleware(
            [`${this.uriOwnerRepoCommitish}`], async (req, res) => {
                console.warn("Common middleware ORC END!");
                // @TODO: we don't need to await this.
                await req.oldSkoolContext.deinit();
            })
    }


}
