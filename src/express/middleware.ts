import {OldSkoolBase} from "./base";
import StatusCodes from "http-status-codes";
import {Express} from "express";
import {RepoResolver} from "../repo/resolver";
import {RenderingContext} from "../assets/context";

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
            await context.init();
            req.oldSkoolContext = context;

            next();
        })

        app.use(`${this.uriOwnerRepoCommitishRecipes}`, async (req, res, next) => {
            console.warn("Common middleware + RECIPES!", req.params);
            next();
        })

        app.use(`${this.uriNoCloudWithParams}`, async (req, res, next) => {
            console.warn("Common middleware + NOCLOUD WITH PARAMS!", req.params);
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
