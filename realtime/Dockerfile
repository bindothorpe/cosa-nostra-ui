# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Realtime image: esbuild produces one self-contained CJS bundle at
# realtime/dist/index.js. The runtime image therefore needs no node_modules.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY game-core ./game-core
COPY realtime ./realtime

RUN pnpm build:realtime


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data
ENV LOG_LEVEL=info

# /data is the snapshot volume. Create it as node so a fresh named volume
# inherits writable ownership for the non-root process.
RUN mkdir -p /data \
 && chown node:node /data

COPY --from=builder --chown=node:node /app/realtime/dist/index.js ./realtime/dist/index.js

USER node

EXPOSE 3001

CMD ["node", "realtime/dist/index.js"]
