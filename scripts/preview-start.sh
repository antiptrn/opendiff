#!/usr/bin/env bash
set -e

PR_NUMBER="${1:?Usage: preview-start.sh <PR_NUMBER> <PREVIEW_DIR>}"
PREVIEW_DIR="${2:?Usage: preview-start.sh <PR_NUMBER> <PREVIEW_DIR>}"

BFF_PORT=$((10000 + PR_NUMBER))
WEBSITE_PORT=$((20000 + PR_NUMBER))
APP_PORT=$((30000 + PR_NUMBER))
AGENT_PORT=$((40000 + PR_NUMBER))

AUTH_PROXY_PORT=9999
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Starting preview services for PR #${PR_NUMBER}..."
echo "  BFF:        port ${BFF_PORT}"
echo "  Website:    port ${WEBSITE_PORT}"
echo "  App:        port ${APP_PORT}"
echo "  Agent:      port ${AGENT_PORT}"
echo "  Auth Proxy: port ${AUTH_PROXY_PORT} (shared)"

# Start the shared auth proxy if not already running
if ! lsof -t -i:${AUTH_PROXY_PORT} > /dev/null 2>&1; then
  echo "Starting preview auth proxy on port ${AUTH_PROXY_PORT}..."
  nohup bun run "$SCRIPT_DIR/preview-auth-proxy.ts" > /home/j/previews/auth-proxy.log 2>&1 &
  sleep 1
fi

# Build and start Docker containers
cd "$PREVIEW_DIR"
docker compose up -d --build

echo ""
echo "Preview PR #${PR_NUMBER} services started."
echo "  BFF     → http://localhost:${BFF_PORT}"
echo "  Website → http://localhost:${WEBSITE_PORT}"
echo "  App     → http://localhost:${APP_PORT}"
echo "  Agent   → http://localhost:${AGENT_PORT}"
