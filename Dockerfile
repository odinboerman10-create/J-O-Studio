FROM node:22-alpine

RUN apk add --no-cache su-exec

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Persistent SQLite data lives here — mount a volume/disk at this path
# on your host so leads survive redeploys and restarts. The entrypoint
# fixes ownership on it at container start (see docker-entrypoint.sh),
# since a runtime-mounted disk isn't affected by this build-time chown.
RUN mkdir -p /app/data && chown -R node:node /app

VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
