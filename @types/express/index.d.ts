import {Repository} from "../../src/repo/repo";
import {RepoResolver} from "../../src/repo/resolver";
import {RenderingContext} from "../../src/assets/context";

declare global {
    namespace Express {
        interface Request {
            oldSkoolResolver: RepoResolver;
            oldSkoolContext: RenderingContext;
        }
    }
}
