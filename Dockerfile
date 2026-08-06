# ── Base: install workspace dependencies ─────────────────────────
FROM oven/bun:1 AS base

WORKDIR /app

COPY package.json bun.lockb ./

COPY packages/shared/package.json ./packages/shared/
COPY packages/components/package.json ./packages/components/
COPY packages/assets/package.json ./packages/assets/
COPY packages/github/package.json ./packages/github/
COPY packages/prompts/package.json ./packages/prompts/
COPY apps/bff/package.json ./apps/bff/
COPY apps/review-agent/package.json ./apps/review-agent/
COPY apps/site/package.json ./apps/site/
COPY apps/app/package.json ./apps/app/
COPY packages/vscode-extension/package.json ./packages/vscode-extension/

RUN bun install

COPY . .

# ── BFF ──────────────────────────────────────────────────────────
FROM base AS bff

RUN cd apps/bff && bunx prisma generate

ENV NODE_ENV=production
USER bun
EXPOSE 3001

CMD ["bun", "run", "apps/bff/src/index.ts"]

# ── Frontend build ───────────────────────────────────────────────
FROM base AS frontend-build

ARG PACKAGE=site
ARG VITE_API_URL
ARG VITE_AUTH_PROVIDERS
ARG VITE_GITHUB_APP_SLUG
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_AUTH_PROVIDERS=${VITE_AUTH_PROVIDERS}
ENV VITE_GITHUB_APP_SLUG=${VITE_GITHUB_APP_SLUG}

RUN bun run --cwd apps/${PACKAGE} build

# ── Frontend serve ───────────────────────────────────────────────
FROM nginx:alpine AS frontend

COPY nginx.conf /etc/nginx/conf.d/default.conf

ARG PACKAGE=site
COPY --from=frontend-build /app/apps/${PACKAGE}/dist /usr/share/nginx/html

EXPOSE 8080

# ── Agent ────────────────────────────────────────────────────────
FROM base AS agent

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
ENV BUN_INSTALL=/usr/local
RUN bun install -g opencode-ai
RUN bun run --cwd apps/review-agent build

ENV NODE_ENV=production
# Disable core dumps — prevents junk files from being committed by git add
RUN ulimit -c 0
ENV BUN_CRASH_REPORTER_URL=""
USER bun
EXPOSE 3000

CMD ["sh", "-c", "ulimit -c 0 && exec bun run apps/review-agent/dist/index.js"]
