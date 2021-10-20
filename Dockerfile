FROM node:16 as build

# Add tini via apt
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get -y update && apt-get -y install tini

# Source work is is /source
WORKDIR /source

#ENV NODE_ENV production

# First the npm stuff, trying to maximize cache hits
ADD package*.json /source/
RUN npm ci --no-audit --progress=false

# Now the sources proper.
ADD @types /source/@types
ADD src /source/src
ADD tsconfig*.json /source/

# Now build it (typescript)
RUN npm run build

# Now the final image
FROM node:16

WORKDIR /geoip
COPY geoip/mmdb/* /geoip/
RUN ls -laR /geoip/

WORKDIR /app
COPY --from=build /source/dist /app/dist
COPY --from=build /source/node_modules /app/node_modules
COPY --from=build /usr/bin/tini /tini

# The ENVs used by oldskool-server @TODO: add all
ENV PORT=3000
ENV REDIS_HOST=192.168.66.67
ENV REDIS_PORT=6379
ENV GEOIP2_ASN_MMDB=/geoip/GeoLite2-City.mmdb
ENV GEOIP2_CITY_MMDB=/geoip/GeoLite2-ASN.mmdb

# Volumes used, if user wants to override.
VOLUME /geoip

ENTRYPOINT ["/tini", "--"]
CMD ["node", "/app/dist", "--env=production"] 
