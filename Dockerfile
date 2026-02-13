# ── Base: install workspace dependencies ─────────────────────────
FROM oven/bun:1-alpine AS base

WORKDIR /app

COPY package.json bun.lockb ./

COPY packages/shared/package.json ./packages/shared/
COPY packages/components/package.json ./packages/components/
COPY packages/assets/package.json ./packages/assets/
COPY packages/github/package.json ./packages/github/
COPY packages/prompts/package.json ./packages/prompts/
COPY packages/bff/package.json ./packages/bff/
COPY packages/review-agent/package.json ./packages/review-agent/
COPY packages/website/package.json ./packages/website/
COPY packages/app/package.json ./packages/app/
COPY packages/vscode-extension/package.json ./packages/vscode-extension/

RUN bun install --frozen-lockfile

COPY . .

# ── BFF ──────────────────────────────────────────────────────────
FROM base AS bff

RUN cd packages/bff && bunx prisma generate

ENV NODE_ENV=production
USER bun
EXPOSE 3001

CMD ["bun", "run", "packages/bff/src/index.ts"]

# ── Frontend build ───────────────────────────────────────────────
FROM base AS frontend-build

ARG PACKAGE=website

RUN bun run --cwd packages/${PACKAGE} build

# ── Frontend serve ───────────────────────────────────────────────
FROM nginx:alpine AS frontend

COPY nginx.conf /etc/nginx/conf.d/default.conf

ARG PACKAGE=website
COPY --from=frontend-build /app/packages/${PACKAGE}/dist /usr/share/nginx/html

EXPOSE 8080

# ── Agent ────────────────────────────────────────────────────────
FROM base AS agent

RUN apk add --no-cache git
RUN bun run --cwd packages/review-agent build

ENV NODE_ENV=production
USER bun
EXPOSE 3000

CMD ["bun", "run", "packages/review-agent/dist/index.js"]
