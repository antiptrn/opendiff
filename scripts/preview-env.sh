#!/usr/bin/env bash
# Generate isolated .env files for a PR preview environment.
# Usage: bash scripts/preview-env.sh <PR_NUMBER> <PREVIEW_DIR>
#
# Creates a dedicated Postgres database (antiptrn_preview_<PR>) and writes
# env files that never touch production secrets.

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
PORT=${BFF_PORT}
DATABASE_URL=postgresql://j:j@localhost:5432/${PREVIEW_DB}
FRONTEND_URL=${APP_URL}
ALLOWED_ORIGINS=${APP_URL},${WEBSITE_URL}
REVIEW_AGENT_WEBHOOK_URL=http://localhost:${AGENT_PORT}/webhook
REVIEW_AGENT_API_KEY=preview-agent-key-${PR_NUMBER}
PAYMENT_PROVIDER=mock
OAUTH_CALLBACK_BASE_URL=https://api-preview.opendiff.dev
PREVIEW_PR_NUMBER=${PR_NUMBER}
GITHUB_CLIENT_ID=${PREVIEW_GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${PREVIEW_GITHUB_CLIENT_SECRET:-}
EOF

# ── App ──────────────────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/packages/app/.env" <<EOF
VITE_API_URL=${BFF_URL}
VITE_APP_URL=${APP_URL}
VITE_WEBSITE_URL=${WEBSITE_URL}
VITE_PORT=${APP_PORT}
VITE_ALLOWED_HOST=pr-${PR_NUMBER}-app.opendiff.dev
EOF

# ── Website ──────────────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/packages/website/.env" <<EOF
VITE_API_URL=${BFF_URL}
VITE_APP_URL=${APP_URL}
VITE_WEBSITE_URL=${WEBSITE_URL}
VITE_PORT=${WEBSITE_PORT}
VITE_ALLOWED_HOST=pr-${PR_NUMBER}.opendiff.dev
EOF

# ── Review Agent ─────────────────────────────────────────────────────────────
cat > "${PREVIEW_DIR}/packages/review-agent/.env" <<EOF
PORT=${AGENT_PORT}
SETTINGS_API_URL=http://localhost:${BFF_PORT}
REVIEW_AGENT_API_KEY=preview-agent-key-${PR_NUMBER}
BOT_USERNAME=opendiff-agent[bot]
EOF

echo "Preview env files written to ${PREVIEW_DIR}"
