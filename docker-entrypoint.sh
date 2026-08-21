#!/bin/sh
set -e

# Render/Railway mount the persistent disk at /app/data at container start,
# after the image is built, with its own ownership — so the chown done at
# build time doesn't apply to it. Fix it here, every start, then drop from
# root to the unprivileged 'node' user before running the app.
mkdir -p /app/data
chown -R node:node /app/data

exec su-exec node "$@"
