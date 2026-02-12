#!/usr/bin/env bash
set -e

PR_NUMBER="${1:?Usage: preview-start.sh <PR_NUMBER>}"

PREVIEW_DIR="/home/j/previews/pr-${PR_NUMBER}"
LOGS="$PREVIEW_DIR/logs"
mkdir -p "$LOGS"

BFF_PORT=$((10000 + PR_NUMBER))
WEBSITE_PORT=$((20000 + PR_NUMBER))
APP_PORT=$((30000 + PR_NUMBER))
AGENT_PORT=$((40000 + PR_NUMBER))

echo "Starting preview services for PR #${PR_NUMBER}..."
echo "  BFF:     port ${BFF_PORT}"
echo "  Website: port ${WEBSITE_PORT}"
echo "  App:     port ${APP_PORT}"
echo "  Agent:   port ${AGENT_PORT}"

# BFF
cd "$PREVIEW_DIR/packages/bff"
PORT=$BFF_PORT nohup bun run src/index.ts > "$LOGS/server.log" 2>&1 &

# Review Agent
cd "$PREVIEW_DIR/packages/review-agent"
PORT=$AGENT_PORT nohup bun run dist/index.js > "$LOGS/agent.log" 2>&1 &

# Website (vite preview)
cd "$PREVIEW_DIR/packages/website"
VITE_PORT=$WEBSITE_PORT nohup bunx vite preview --port "$WEBSITE_PORT" > "$LOGS/website.log" 2>&1 &

# App (vite preview)
cd "$PREVIEW_DIR/packages/app"
VITE_PORT=$APP_PORT nohup bunx vite preview --port "$APP_PORT" > "$LOGS/app.log" 2>&1 &

sleep 2

echo ""
echo "Preview PR #${PR_NUMBER} services:"
echo "  BFF     → http://localhost:${BFF_PORT}  (pid: $(lsof -t -i:${BFF_PORT} 2>/dev/null || echo 'starting...'))"
echo "  Website → http://localhost:${WEBSITE_PORT}  (pid: $(lsof -t -i:${WEBSITE_PORT} 2>/dev/null || echo 'starting...'))"
echo "  App     → http://localhost:${APP_PORT}  (pid: $(lsof -t -i:${APP_PORT} 2>/dev/null || echo 'starting...'))"
echo "  Agent   → http://localhost:${AGENT_PORT}  (pid: $(lsof -t -i:${AGENT_PORT} 2>/dev/null || echo 'starting...'))"
echo ""
echo "Logs: $LOGS/"
