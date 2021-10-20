import {TedisPool} from "tedis";
import logger from './shared/Logger';
import {OldSkoolServer} from "./express/paths";
import {DefaultGeoIPReaders, GeoIpReaders} from "./shared/geoip";
import {aff} from "./shared/utils";

new aff();

// Start the server
async function index() {
    // prepare Tedis for Redis caching.
    let redisPort: number = 6379;
    let redisHost: string = "127.0.0.1";
    if (process.env.REDIS_HOST) redisHost = process.env.REDIS_HOST;
    if (process.env.REDIS_PORT) redisPort = ~~process.env.REDIS_PORT;

    let tedisPool = new TedisPool({port: redisPort, host: redisHost});
    let oneTedis = await tedisPool.getTedis();
    tedisPool.putTedis(oneTedis);

    // prepare the GeoIP database, which sits in ~/Downloads, or env env.GEOIP2_ASN_MMDB and env.GEOIP2_CITY_MMDB
    let geoIpReaders: GeoIpReaders = await (new DefaultGeoIPReaders()).prepareReaders();

    // Start the Express stuff.
    await new OldSkoolServer(tedisPool, geoIpReaders).createAndListen();
}

index().then(value => {
    logger.info("Server setup OK.")
}).catch(reason => {
    console.log(reason);
    process.exit(3);
    throw reason;
});


