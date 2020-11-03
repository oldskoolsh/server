import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';

import express, {NextFunction, Request, Response} from 'express';
import StatusCodes from 'http-status-codes';
import 'express-async-errors';

import logger from './shared/Logger';
import {Recipe} from "./repo/recipe";
import {CloudInitRecipeListExpander} from "./assets/ci_expander";
import {CloudInitYamlMerger} from "./assets/ci_yaml_merger";
import {CloudInitProcessorStack} from "./processors/stack";
import {RepoResolver} from "./repo/resolver";
import {RenderingContext} from "./assets/context";
import YAML from 'yaml';
import {BashScriptAsset} from "./assets/bash";

const app = express();
const {BAD_REQUEST} = StatusCodes;

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cookieParser());

// Show routes called in console during development
//if (process.env.NODE_ENV === 'development') {
app.use(morgan('dev'));
//}

// Security
//if (process.env.NODE_ENV === 'production') {
app.use(helmet());
//}

// Add APIs
//app.use('/api', BaseRouter);

// Print API errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.err(err, true);
    return res.status(BAD_REQUEST).json({
        error: err.message,
    });
});
/*

app.use(async (req, res, next) => {
    // try to extract user/repo/commit-ish from the url;
    // at least user/repo and optional commit-ish;
    // if found store in the request.
    // if not found use the default from somewhere.
    // main thing here is to cleanup the URL for the next middleware
    await console.log("Yeah some middleware here");
    await console.log("url: ", req.url);
    next();
});


// the stuff
app.get('/bunda/:id', async (req: Request, res: Response) => {
    await console.log("Here BUNDA got the URL...", req.url, req.my_custom_property, req.rootRepo);
    return res.status(200).contentType("text/plain").json({bunda: "bunda", param: req.params.id});
});
app.get('/', async (req: Request, res: Response) => {
    await console.log("Here ROOT got the URL...", req.url);
    return res.status(200).contentType("text/plain").json({root: "root"});
});
app.get('*', async (req: Request, res: Response) => {
    await console.log("Here ASTER got the URL...", req.url);
    return res.status(200).contentType("text/plain").json({aster: "asterisk"});
});
*/

// common middleware for specified ORC; @TODO: really implement;
app.use("/:owner/:repo/:commitish", async (req, res, next) => {
    //console.warn("Common middleware START!", req.params);
    // Fake, should come from :owner/:repo/:commitish
    const resolver = new RepoResolver("/Users/pardini/Documents/Projects/github/oldskool", "oldskool-rpardini");
    await resolver.rootResolve();
    req.oldSkoolResolver = resolver;

    // also fake, should come from request datum
    let context = new RenderingContext("http://192.168.66.67:3000/");
    context.moduleUrl = `${context.baseUrl}${req.params.owner}/${req.params.repo}/${req.params.commitish}`;
    await context.init();
    req.oldSkoolContext = context;

    next();
})


async function mainUserData(req: Request, res: Response) {
    // read recipes from request path
    let initialRecipes: string[] = req.params.recipes.split(",");
    let allRecipes: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
    let finalRecipes = allRecipes.map(value => value.id);

    let finalInitScripts =
        (
            await Promise.all(
                allRecipes
                    .map(async (recipe: Recipe) => await recipe.getAutoScripts(recipe.def.auto_initscripts))
            )
        )
            .flatMap(value => value);

    let finalLauncherScripts = (
        await Promise.all(
            allRecipes
                .map(async (recipe: Recipe) => await recipe.getAutoScripts(recipe.def.auto_launchers))
        )
    ).flatMap(value => value);

    let body = "#include\n";

    // @TODO: explanations!
    // link to the yaml-merger
    body += `${req.oldSkoolContext.moduleUrl}/${finalRecipes.join(',')}/cloudinityaml` + "\n";

    // @TODO: possibly use a launcher-script (that can gather info from the instance) and _then_ process that YAML.
    // link to the launcher-creators...
    // consider: boot-cmd processor; cloud-init-per; etc.
    finalLauncherScripts.forEach(script => {
        body += `# launcher : ${script}\n`;
        body += `${req.oldSkoolContext.moduleUrl}/launcher/${script}\n`;
    });


    // link to the init-scripts, directly.
    //newList.map()
    finalInitScripts.forEach(script => {
        body += `# initscript: ${script}\n`;
        body += `${req.oldSkoolContext.moduleUrl}/bash/${script}\n`;
    });


    return res.status(200).contentType("text/plain").send(body);
}

// This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
app.get("/:owner/:repo/:commitish/:recipes", async (req, res, next) => {
    return await mainUserData(req, res);
});

// This "root" thing produces "#include" for yamls, auto-launchers, and init scripts.
app.get("/:owner/:repo/:commitish/:recipes/cloudinityaml", async (req, res) => {
    // read recipes from request path
    let initialRecipes: string[] = req.params.recipes.split(",");
    // re-expand, although the main already expanded.
    let newList: Recipe[] = await (new CloudInitRecipeListExpander(req.oldSkoolContext, req.oldSkoolResolver, initialRecipes)).expand();
    let merged = await (new CloudInitYamlMerger(req.oldSkoolContext, req.oldSkoolResolver, newList)).mergeYamls();
    // Processor stack processing
    let finalResult = await new CloudInitProcessorStack(req.oldSkoolContext, req.oldSkoolResolver, merged).addDefaultStack().process();

    let body: string = `#cloud-config\n`;
    body += `# final recipes: ${newList.map(value => value.id).join(", ")} \n`;
    body += finalResult;

    return res.status(200).contentType("text/plain").send(body);
});

app.get("/:owner/:repo/:commitish/bash/:path(*)", async (req, res) => {
    console.log("asset path", req.params.path);
    let body = await (new BashScriptAsset(req.oldSkoolContext, req.oldSkoolResolver, req.params.path)).render();
    return res.status(200).contentType("text/plain").send(body);
});


// for use with dsnocloud, cloud-init appends "meta-data" and "user-data"
// we serve metadata so it does not complain; instance-id is required.
app.get("/:owner/:repo/:commitish/:recipes/dsnocloud/meta-data", async (req, res) => {
    let metaData: any = {};
    metaData["instance-id"] = "i-87018aed";
    let yamlMetaData = YAML.stringify(metaData);
    console.log("Served meta-data YAML!");
    return res.status(200).contentType("text/yaml").send(yamlMetaData);
});

// for use with dsnocloud, user-data is the same as the main entrypoint
app.get("/:owner/:repo/:commitish/:recipes/dsnocloud/user-data", async (req, res) => {
    return await mainUserData(req, res);
});


// common middleware for specified ORC;
app.use("/:owner/:repo/:commitish", async (req, res, next) => {
    console.warn("Common middleware END!", req.params);
    await req.oldSkoolContext.deinit();
    next();
})


// Export express instance
export default app;
