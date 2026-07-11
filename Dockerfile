# BOWYER production image.
# better-sqlite3 is a native module, so we build and run on the same base image.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
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

USER nextjs
EXPOSE 3005
VOLUME ["/data"]

CMD ["node", "server.js"]
