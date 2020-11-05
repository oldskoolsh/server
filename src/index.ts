import {OldSkoolServer} from './Server';
import {TedisPool} from "tedis";
import logger from './shared/Logger';

// Start the server
async function index() {
    let tedisPool = new TedisPool({port: 6379, host: "127.0.0.1"});
    let oneTedis = await tedisPool.getTedis();
    tedisPool.putTedis(oneTedis);

    await new OldSkoolServer(tedisPool).createAndListen();
};

index().then(value => {
    console.log("Server setup OK.")
}).catch(reason => {
    console.log(reason);
    process.exit(3);
    throw reason;
});


