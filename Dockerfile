# BOWYER production image.
# better-sqlite3 is a native module, so we build and run on the same base image.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_BOWYER_NETWORK=testnet
ENV NEXT_PUBLIC_BOWYER_NETWORK=$NEXT_PUBLIC_BOWYER_NETWORK
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
# cycletls' Go binary verifies TLS against the system CA store, which is empty on
# the slim image — install root certs so auth.privy.io / fomo API handshakes pass.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
# SQLite lives on a mounted volume so data survives restarts and redeploys.
ENV BOWYER_DB_PATH=/data/bowyer.db

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs \
  && mkdir -p /data && chown nextjs:nodejs /data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# db.ts loads better-sqlite3 via eval('require'), which Next's file tracing
# can't see — copy the native module (and its runtime deps) in explicitly.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path
# cycletls spawns a Go binary (dist/index) at runtime; Next's file tracing sees
# the JS (already in standalone) but not the spawned binary — copy it in (linux/amd64).
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cycletls/dist/index ./node_modules/cycletls/dist/index

# Note: no USER drop — platform volumes (e.g. Railway) mount root-owned, and
# the container is already isolated. Mount persistent storage at /data.
EXPOSE 3005

CMD ["node", "server.js"]
