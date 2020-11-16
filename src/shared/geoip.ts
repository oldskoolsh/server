import {Reader, ReaderModel} from "@maxmind/geoip2-node";

export interface GeoIpReaders {
    city: ReaderModel;
    asn: ReaderModel;
}

export class DefaultGeoIPReaders {

    async prepareReaders(): Promise<GeoIpReaders> {
        return {
            asn: await Reader.open(
                process.env.GEOIP2_CITY_MMDB ||
                process.env['HOME'] + "/Downloads/GeoLite2-ASN.mmdb"
            )
            ,
            city: await Reader.open(
                process.env.GEOIP2_CITY_MMDB ||
                process.env['HOME'] + "/Downloads/GeoLite2-City.mmdb"
            )
        }
    }

}

