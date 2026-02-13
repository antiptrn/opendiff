#!/usr/bin/env bash
# Generate isolated .env files and docker-compose.yml for a PR preview environment.
# Usage: bash scripts/preview-env.sh <PR_NUMBER> <PREVIEW_DIR>
#
# Creates a dedicated Postgres database (antiptrn_preview_<PR>) and writes
# env files that containers use at runtime via docker compose env_file.

set -euo pipefail

PR_NUMBER="${1:?Usage: preview-env.sh <PR_NUMBER> <PREVIEW_DIR>}"
PREVIEW_DIR="${2:?Usage: preview-env.sh <PR_NUMBER> <PREVIEW_DIR>}"

BFF_PORT=$((10000 + PR_NUMBER))
WEBSITE_PORT=$((20000 + PR_NUMBER))
APP_PORT=$((30000 + PR_NUMBER))
AGENT_PORT=$((40000 + PR_NUMBER))

BFF_URL="https://pr-${PR_NUMBER}-api.opendiff.dev"
APP_URL="https://pr-${PR_NUMBER}-app.opendiff.dev"
WEBSITE_URL="https://pr-${PR_NUMBER}.opendiff.dev"

PREVIEW_DB="antiptrn_preview_${PR_NUMBER}"

# ── Create preview database if it doesn't exist ──────────────────────────────
if ! psql -U j -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${PREVIEW_DB}'" | grep -q 1; then
  echo "Creating preview database: ${PREVIEW_DB}"
  psql -U j -d postgres -c "CREATE DATABASE ${PREVIEW_DB};"
fi

# ── BFF ──────────────────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/packages/bff/.env" <<EOF
PORT=3001
DATABASE_URL=postgresql://j:j@host.docker.internal:5432/${PREVIEW_DB}
FRONTEND_URL=${APP_URL}
ALLOWED_ORIGINS=${APP_URL},${WEBSITE_URL}
REVIEW_AGENT_WEBHOOK_URL=http://host.docker.internal:${AGENT_PORT}/webhook
REVIEW_AGENT_API_KEY=preview-agent-key-${PR_NUMBER}
PAYMENT_PROVIDER=mock
OAUTH_CALLBACK_BASE_URL=https://api-preview.opendiff.dev
PREVIEW_PR_NUMBER=${PR_NUMBER}
GITHUB_CLIENT_ID=${PREVIEW_GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${PREVIEW_GITHUB_CLIENT_SECRET:-}
EOF

# ── App (VITE_* vars read from .env by vite during Docker build) ─────────────
cat > "${PREVIEW_DIR}/packages/app/.env" <<EOF
VITE_API_URL=${BFF_URL}
VITE_APP_URL=${APP_URL}
VITE_WEBSITE_URL=${WEBSITE_URL}
EOF

# ── Website (VITE_* vars read from .env by vite during Docker build) ─────────
cat > "${PREVIEW_DIR}/packages/website/.env" <<EOF
VITE_API_URL=${BFF_URL}
VITE_APP_URL=${APP_URL}
VITE_WEBSITE_URL=${WEBSITE_URL}
EOF

# ── Review Agent ─────────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/packages/review-agent/.env" <<EOF
PORT=3000
SETTINGS_API_URL=http://host.docker.internal:${BFF_PORT}
REVIEW_AGENT_API_KEY=preview-agent-key-${PR_NUMBER}
BOT_USERNAME=opendiff-agent[bot]
EOF

# ── Docker Compose ───────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/docker-compose.yml" <<EOF
services:
  bff:
    build:
      context: .
      dockerfile: Dockerfile
      target: bff
    ports:
      - "${BFF_PORT}:3001"
    env_file: packages/bff/.env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    labels:
      preview-pr: "${PR_NUMBER}"
    mem_limit: 512m
    restart: unless-stopped

  website:
    build:
      context: .
      dockerfile: Dockerfile
      target: frontend
      args:
        PACKAGE: website
    ports:
      - "${WEBSITE_PORT}:80"
    labels:
      preview-pr: "${PR_NUMBER}"
    mem_limit: 128m
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: frontend
      args:
        PACKAGE: app
    ports:
      - "${APP_PORT}:80"
    labels:
      preview-pr: "${PR_NUMBER}"
    mem_limit: 128m
    restart: unless-stopped

  agent:
    build:
      context: .
      dockerfile: Dockerfile
      target: agent
    ports:
      - "${AGENT_PORT}:3000"
    env_file: packages/review-agent/.env
    extra_hosts:
      - "host.docker.internal:host-gateway"
    labels:
      preview-pr: "${PR_NUMBER}"
    mem_limit: 512m
    restart: unless-stopped
EOF

echo "Preview env files and docker-compose.yml written to ${PREVIEW_DIR}"
