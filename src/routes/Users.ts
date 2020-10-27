import StatusCodes from 'http-status-codes';
import {Request, Response, Router} from 'express';

const router = Router();
const {OK} = StatusCodes;


router.get('/all', async (req: Request, res: Response) => {
    const users = {bull: "shit"};
    return res.status(OK).json({users});
});


export default router;
