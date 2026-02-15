#!/usr/bin/env bash
# Generate isolated .env files and docker-compose.yml for a PR preview environment.
# Usage: bash scripts/preview-env.sh <PR_NUMBER> <PREVIEW_DIR>
#
# Creates a dedicated Postgres database (<prefix><PR>) and writes
# env files that containers use at runtime via docker compose env_file.
#
# Optional environment overrides:
# - PREVIEW_DOMAIN, PREVIEW_APP_SUBDOMAIN_PREFIX, PREVIEW_API_SUBDOMAIN_PREFIX,
#   PREVIEW_AGENT_SUBDOMAIN_PREFIX
# - PREVIEW_DB_PREFIX, PREVIEW_DB_USER, PREVIEW_DB_PASSWORD, PREVIEW_DB_HOST,
#   PREVIEW_DB_PORT, PREVIEW_DB_ADMIN_DB
# - PREVIEW_DB_ADMIN_USER, PREVIEW_DB_ADMIN_PASSWORD
# - PREVIEW_DB_APP_USER, PREVIEW_DB_APP_PASSWORD
# - PREVIEW_OAUTH_CALLBACK_BASE_URL, PREVIEW_BOT_USERNAME

set -euo pipefail

PR_NUMBER="${1:?Usage: preview-env.sh <PR_NUMBER> <PREVIEW_DIR>}"
PREVIEW_DIR="${2:?Usage: preview-env.sh <PR_NUMBER> <PREVIEW_DIR>}"

BFF_PORT=$((10000 + PR_NUMBER))
WEBSITE_PORT=$((20000 + PR_NUMBER))
APP_PORT=$((30000 + PR_NUMBER))
AGENT_PORT=$((40000 + PR_NUMBER))

PREVIEW_DOMAIN="${PREVIEW_DOMAIN:-opendiff.dev}"
PREVIEW_APP_SUBDOMAIN_PREFIX="${PREVIEW_APP_SUBDOMAIN_PREFIX:-app}"
PREVIEW_API_SUBDOMAIN_PREFIX="${PREVIEW_API_SUBDOMAIN_PREFIX:-api}"
PREVIEW_AGENT_SUBDOMAIN_PREFIX="${PREVIEW_AGENT_SUBDOMAIN_PREFIX:-agent}"
PREVIEW_DB_PREFIX="${PREVIEW_DB_PREFIX:-opendiff_preview_}"
PREVIEW_DB_USER="${PREVIEW_DB_USER:-postgres}"
PREVIEW_DB_ADMIN_USER="${PREVIEW_DB_ADMIN_USER:-$PREVIEW_DB_USER}"
# Default app user to the admin user (more robust for CI)
PREVIEW_DB_APP_USER="${PREVIEW_DB_APP_USER:-$PREVIEW_DB_ADMIN_USER}"

# Back-compat: PREVIEW_DB_PASSWORD is used when per-role passwords aren't provided.
PREVIEW_DB_PASSWORD="${PREVIEW_DB_PASSWORD:-}"
PREVIEW_DB_ADMIN_PASSWORD="${PREVIEW_DB_ADMIN_PASSWORD:-$PREVIEW_DB_PASSWORD}"
PREVIEW_DB_APP_PASSWORD="${PREVIEW_DB_APP_PASSWORD:-$PREVIEW_DB_PASSWORD}"
PREVIEW_DB_HOST="${PREVIEW_DB_HOST:-localhost}"
PREVIEW_DB_PORT="${PREVIEW_DB_PORT:-5432}"
PREVIEW_DB_ADMIN_DB="${PREVIEW_DB_ADMIN_DB:-postgres}"
PREVIEW_OAUTH_CALLBACK_BASE_URL="${PREVIEW_OAUTH_CALLBACK_BASE_URL:-https://api-preview.${PREVIEW_DOMAIN}}"
PREVIEW_BOT_USERNAME="${PREVIEW_BOT_USERNAME:-opendiff-agent[bot]}"

ADMIN_DB_PASSWORD_SEGMENT=""
if [ -n "$PREVIEW_DB_ADMIN_PASSWORD" ]; then
  ADMIN_DB_PASSWORD_SEGMENT=":${PREVIEW_DB_ADMIN_PASSWORD}"
fi

APP_DB_PASSWORD_SEGMENT=""
if [ -n "$PREVIEW_DB_APP_PASSWORD" ]; then
  APP_DB_PASSWORD_SEGMENT=":${PREVIEW_DB_APP_PASSWORD}"
fi

BFF_URL="https://pr-${PR_NUMBER}-${PREVIEW_API_SUBDOMAIN_PREFIX}.${PREVIEW_DOMAIN}"
APP_URL="https://pr-${PR_NUMBER}-${PREVIEW_APP_SUBDOMAIN_PREFIX}.${PREVIEW_DOMAIN}"
WEBSITE_URL="https://pr-${PR_NUMBER}.${PREVIEW_DOMAIN}"

AGENT_API_KEY=$(openssl rand -hex 16)
PREVIEW_DB="${PREVIEW_DB_PREFIX}${PR_NUMBER}"

# ── Create preview database if it doesn't exist ──────────────────────────────
export PGPASSWORD="$PREVIEW_DB_ADMIN_PASSWORD"

PSQL_HOST_ARGS=()
if [ -n "${PREVIEW_DB_HOST:-}" ] && [ "$PREVIEW_DB_HOST" != "localhost" ] && [ "$PREVIEW_DB_HOST" != "127.0.0.1" ]; then
  PSQL_HOST_ARGS+=( -h "$PREVIEW_DB_HOST" -p "$PREVIEW_DB_PORT" )
fi

if ! psql "${PSQL_HOST_ARGS[@]}" -U "$PREVIEW_DB_ADMIN_USER" -d "$PREVIEW_DB_ADMIN_DB" -tAc "SELECT 1 FROM pg_database WHERE datname = '${PREVIEW_DB}'" | grep -q 1; then
  echo "Creating preview database: ${PREVIEW_DB}"
  psql "${PSQL_HOST_ARGS[@]}" -U "$PREVIEW_DB_ADMIN_USER" -d "$PREVIEW_DB_ADMIN_DB" -c "CREATE DATABASE ${PREVIEW_DB};"
fi

# ── BFF ──────────────────────────────────────────────────────────────────────
# Note: We intentionally use the admin DB user for `DATABASE_URL` in preview.
# Preview runs migrations inside the bff container and needs DDL privileges.
# This avoids brittle failures when a separate app user isn't provisioned.
cat > "${PREVIEW_DIR}/packages/bff/.env" <<EOF
PORT=3001
DATABASE_URL=postgresql://${PREVIEW_DB_ADMIN_USER}${ADMIN_DB_PASSWORD_SEGMENT}@host.docker.internal:${PREVIEW_DB_PORT}/${PREVIEW_DB}
FRONTEND_URL=${APP_URL}
ALLOWED_ORIGINS=${APP_URL},${WEBSITE_URL}
REVIEW_AGENT_WEBHOOK_URL=http://host.docker.internal:${AGENT_PORT}/webhook
REVIEW_AGENT_API_KEY=${AGENT_API_KEY}
PAYMENT_PROVIDER=mock
OAUTH_CALLBACK_BASE_URL=${PREVIEW_OAUTH_CALLBACK_BASE_URL}
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
REVIEW_AGENT_API_KEY=${AGENT_API_KEY}
BOT_USERNAME=${PREVIEW_BOT_USERNAME}
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
    init: true
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
      - "${WEBSITE_PORT}:8080"
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
      - "${APP_PORT}:8080"
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
    init: true
    mem_limit: 512m
    restart: unless-stopped
EOF

echo "Preview env files and docker-compose.yml written to ${PREVIEW_DIR}"
