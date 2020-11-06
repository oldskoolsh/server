import {TedisPool} from "tedis";
import logger from './shared/Logger';
import {OldSkoolServer} from "./express/paths";
import {aff} from "./shared/utils";

new aff();

// Start the server
async function index() {
    let tedisPool = new TedisPool({port: 6379, host: "127.0.0.1"});
    let oneTedis = await tedisPool.getTedis();
    tedisPool.putTedis(oneTedis);

    await new OldSkoolServer(tedisPool).createAndListen();
}

index().then(value => {
    logger.info("Server setup OK.")
}).catch(reason => {
    console.log(reason);
    process.exit(3);
    throw reason;
});


