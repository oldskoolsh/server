import {TedisPool} from "tedis";
import logger from "../shared/Logger";
import express, {Express, NextFunction, Request, Response} from "express";
import morgan from "morgan";
import StatusCodes from "http-status-codes";
import {RenderingContext} from "../assets/context";
// Hack into Express to be able to catch exceptions thrown from async handlers.
// Yes, a "require" here is the only way to make this work.
require('express-async-errors');

const {BAD_REQUEST, OK} = StatusCodes;

export abstract class OldSkoolBase {
    protected readonly tedisPool: TedisPool;
    protected readonly app: Express;

    constructor(tedisPool: TedisPool) {
        this.tedisPool = tedisPool;
        this.app = express();
    }

    handle(paths: string[], handler: (context: RenderingContext, res: Response, req: Request) => Promise<void>) {
        for (const path of paths) {
            this.app.get(path, async (req, res, next) => {
                await handler(req.oldSkoolContext, res, req);
                next();
            });
        }
    }

    middleware(paths: string[], handler: (req: Request, res: Response) => Promise<void>) {
        for (const path of paths) {
            this.app.use(path, async (req, res, next) => {
                await handler(req, res);
                next();
            });
        }
    }

    async createAndListen() {
        let app = await this.createExpressServer();
        const port = Number(process.env.PORT || 3000);
        let bla = await app.listen(port, () => {
            logger.info(`Express server started on port: ${port}`);
        });
    }

    async createExpressServer() {
        // use strong etags... beware NGINX, which will downgrade to weak during gzip.
        this.app.set('etag', 'strong');

        //this.app.set('etag', function (body: any, encoding: any) {
        //    return null;
        //})

        // handle reverse proxy (X-Forwarded-For etc)
        this.app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);

        // Show routes called in console during development
        this.app.use(morgan('combined'));

        // "Security headers"
        // import helmet from 'helmet';
        //app.use(helmet());

        // Print API errors
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.err(err, true);
            return res.status(BAD_REQUEST).json({
                error: err.message,
            });
        });

        this.addEntranceMiddleware(this.app);
        this.addPathHandlers(this.app);
        this.addExitMiddleware(this.app);

        return this.app;
    }

    abstract addExitMiddleware(app: Express): void;

    abstract addPathHandlers(app: Express): void;

    abstract addEntranceMiddleware(app: Express): void;


}
