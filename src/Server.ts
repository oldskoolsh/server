import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';

import express, {NextFunction, Request, Response} from 'express';
import StatusCodes from 'http-status-codes';
import 'express-async-errors';

//import BaseRouter from './routes';
import logger from './shared/Logger';
import {Repository} from "./repo/repo";

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

// Export express instance
export default app;
