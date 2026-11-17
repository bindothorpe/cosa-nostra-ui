# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Web image: Next.js standalone output.
#
# Build args (NEXT_PUBLIC_* are inlined by Next at build time):
#   NEXT_PUBLIC_GAME_MODE       default "live" (client supports "mock" | "live")
#   NEXT_PUBLIC_REALTIME_BASE   empty for same-origin /rt; set only for subdomain
# ---------------------------------------------------------------------------

FROM node:22-alpine AS deps

# Next.js native dependencies (sharp, SWC helpers) expect glibc compatibility.
RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

RUN corepack enable \
 && corepack prepare pnpm@10.33.0 --activate

ENV NEXT_TELEMETRY_DISABLED=1

ARG NEXT_PUBLIC_GAME_MODE=live
ARG NEXT_PUBLIC_REALTIME_BASE=
ENV NEXT_PUBLIC_GAME_MODE=${NEXT_PUBLIC_GAME_MODE}
ENV NEXT_PUBLIC_REALTIME_BASE=${NEXT_PUBLIC_REALTIME_BASE}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs \
 && adduser -S -u 1001 -G nodejs nextjs

# The standalone bundle already contains the traced production node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
