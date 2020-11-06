import {TedisPool} from "tedis";
import logger from "../shared/Logger";
import express, {Express, NextFunction, Request, Response} from "express";
import morgan from "morgan";
import StatusCodes from "http-status-codes";
const {BAD_REQUEST, OK} = StatusCodes;

export abstract class OldSkoolBase {
    protected readonly tedisPool: TedisPool;

    constructor(tedisPool: TedisPool) {
        this.tedisPool = tedisPool;
    }

    async createAndListen() {
        let app = await this.createExpressServer();
        const port = Number(process.env.PORT || 3000);
        let bla = await app.listen(port, () => {
            logger.info(`Express server started on port: ${port}`);
        });
    }

    async createExpressServer() {
        const app: Express = express();

        // Show routes called in console during development
        app.use(morgan('combined'));

        // "Security headers"
        // import helmet from 'helmet';
        //app.use(helmet());

        // Print API errors
        app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            logger.err(err, true);
            return res.status(BAD_REQUEST).json({
                error: err.message,
            });
        });

        this.addEntranceMiddleware(app);
        this.addPathHandlers(app);
        this.addExitMiddleware(app);

        return app;
    }

    abstract addExitMiddleware(app: Express):void;
    abstract addPathHandlers(app: Express):void;
    abstract addEntranceMiddleware(app: Express):void;


}
