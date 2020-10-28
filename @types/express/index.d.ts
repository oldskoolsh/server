import {Repository} from "../../src/repo/repo";

declare global {
    namespace Express {
        interface Request {
            my_custom_property: String
            rootRepo: Repository
        }
    }
}
