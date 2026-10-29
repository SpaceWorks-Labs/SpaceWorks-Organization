# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
# (The skipped check flags the NEXT_SERVER_ACTIONS_ENCRYPTION_KEY build-arg
# fallback in the builder stage; see the comment there for the tradeoff.)
#
# Two published images come from this file (see .github/workflows/release.yml):
#   runner    -> ghcr.io/<owner>/spaceworks-organization-backend   every backend role: the app and API,
#                migrations, the BullMQ worker and beat, and operator checks (scripts/docker-entrypoint.sh --role)
#   frontend  -> ghcr.io/<owner>/spaceworks-organization-frontend  the website alone, for the split layout
# Release images are the same for every installation: public origins are
# placeholders (spaceworks-organization-origin.invalid, -backend.invalid) that
# docker-entrypoint.sh replaces at start, and each installation supplies its own
# Server Actions key.

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY frontend/package.json ./frontend/package.json
# `npm ci` runs the Prisma postinstall hook, which needs the schema available.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# Prisma CLI only, pinned to the lockfile's version, for the backend image's
# migrate role (and MIGRATE_ON_START=1). Kept apart from the app's node_modules.
FROM node:22-alpine AS prisma-cli
WORKDIR /opt/prisma-cli
COPY --from=deps /app/node_modules/prisma/package.json /tmp/prisma-package.json
RUN npm install --omit=dev --no-save --no-audit --no-fund \
      "prisma@$(node -p "require('/tmp/prisma-package.json').version")" \
    && npm cache clean --force

# Clients the VPS operator tools (docker/ops/*.mjs) import, pinned to the
# lockfile's versions. The application bundles its own copies into its build.
FROM node:22-alpine AS ops-modules
WORKDIR /opt/ops
COPY --from=deps /app/node_modules/ioredis/package.json /tmp/ioredis-package.json
COPY --from=deps /app/node_modules/@aws-sdk/client-s3/package.json /tmp/s3-package.json
COPY --from=deps /app/node_modules/bcryptjs/package.json /tmp/bcryptjs-package.json
RUN npm install --omit=dev --no-save --no-audit --no-fund \
      "ioredis@$(node -p "require('/tmp/ioredis-package.json').version")" \
      "bcryptjs@$(node -p "require('/tmp/bcryptjs-package.json').version")" \
      "@aws-sdk/client-s3@$(node -p "require('/tmp/s3-package.json').version")" \
    && npm cache clean --force

# Stage 2: Rebuild the source code
FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
# Fallback for builders without BuildKit secrets wired up. Render passes every
# service environment variable to `docker build` as a build arg of the same
# name, so the runtime key is reused for the build without extra setup. The
# value then exists in this builder stage's metadata and build cache, but not
# in the final runner image (a separate stage). Prefer the secret mount below
# wherever the builder supports it (local Docker, GitHub Actions, Compose).
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# This stage starts fresh; avoid writing a compiler cache that the runner never uses.
ENV SWO_DISABLE_BUILD_CACHE=1

RUN npx prisma generate
# The key is consumed by Next.js while compiling Server Actions. Every image
# replica must be built with one stable key and receive that same key at runtime.
# A BuildKit secret (`--secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,...`, or a
# Render secret file with that name) takes precedence over the build arg.
RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    if [ -s /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ]; then \
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)"; \
    fi; \
    if [ -z "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" ]; then \
      echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required: pass it as a BuildKit secret or build arg." >&2; \
      exit 1; \
    fi; \
    export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; \
    npm run build
# The worker and beat roles: esbuild bundles of scripts/queue/*.ts (dist/worker.js, dist/beat.js).
RUN node scripts/build-jobs.mjs

# The separately deployable rendering frontend (the frontend/ workspace, the
# same build Netlify runs), published as spaceworks-organization-frontend. It
# holds no database, mail, Redis or storage client and reaches the backend only
# through the authenticated gateway.
FROM node:22-alpine AS frontend-builder
WORKDIR /app
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_BACKEND_ORIGIN
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BACKEND_ORIGIN=$NEXT_PUBLIC_BACKEND_ORIGIN
ENV BACKEND_ORIGIN=$NEXT_PUBLIC_BACKEND_ORIGIN
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV SWO_DISABLE_BUILD_CACHE=1
ENV SWO_FRONTEND_STANDALONE=1
RUN npx prisma generate
RUN --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY     if [ -s /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY ]; then       NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)";     fi;     if [ -z "$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY" ]; then       echo "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required: pass it as a BuildKit secret or build arg." >&2;       exit 1;     fi;     export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY;     npm run build:frontend

FROM node:22-alpine AS frontend
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# Standalone output for a workspace keeps its path below the repository root.
COPY --from=frontend-builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=frontend-builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-builder --chown=nextjs:nodejs /app/frontend/public ./frontend/public
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN rm -f frontend/.env frontend/.env.local frontend/.env.production .env
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Where docker-entrypoint.sh finds the build to apply the public origins to.
ENV SWO_NEXT_DIR=/app/frontend/.next
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["--role", "frontend", "node", "frontend/server.js"]

# Stage 3: Production runner (keep this the LAST stage: Render builds the final
# stage because a Blueprint cannot select a build target). The same image runs
# every backend role: the web app, migrations, the worker, beat and the operator checks.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Sharp renders card and receipt SVGs on the server. Alpine has no system
# fonts by default, which otherwise turns every text glyph into a box.
# OpenSSL creates the VPS's private CA and service certificates (ops role).
RUN apk add --no-cache font-dejavu openssl && fc-cache -f

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

# Leverage Next.js standalone tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Prisma CLI for the migrate role and MIGRATE_ON_START=1 (root-owned, read-only).
COPY --from=prisma-cli /opt/prisma-cli/node_modules /opt/prisma-cli/node_modules
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Worker and beat bundles (they import the standalone @prisma/client and sharp), root-owned.
COPY --from=builder /app/dist ./dist
# Operator tools (docker/ops), root-owned.
COPY docker/ops ./docker/ops
COPY --from=ops-modules /opt/ops/node_modules ./docker/ops/node_modules

# Next's standalone trace may include dotenv files when a build is performed
# from a developer checkout. Secrets belong only in the runtime environment.
RUN rm -f .env .env.local .env.production .env.development

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["--role", "backend", "node", "server.js"]
