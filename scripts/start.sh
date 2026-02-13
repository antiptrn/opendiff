#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/logs"
mkdir -p "$LOGS"

MODE="${1:-dev}"

# Kill existing services first
bash "$ROOT/scripts/stop.sh" "$MODE" 2>/dev/null || true

if [ "$MODE" = "prod" ]; then
  echo "Starting prod services via Docker..."
  docker compose -f "$ROOT/docker-compose.prod.yml" up -d --build
else
  echo "Starting dev services..."
  nohup bun run --cwd "$ROOT/packages/bff" dev > "$LOGS/server.log" 2>&1 &
  nohup bun run --cwd "$ROOT/packages/website" dev > "$LOGS/website.log" 2>&1 &
  nohup bun run --cwd "$ROOT/packages/app" dev > "$LOGS/app.log" 2>&1 &
  nohup bun run --cwd "$ROOT/packages/review-agent" dev > "$LOGS/agent.log" 2>&1 &
fi

sleep 2

echo ""
echo "Services:"
echo "  server  → http://localhost:3001  (pid: $(lsof -t -i:3001 2>/dev/null || echo 'starting...'))"
echo "  website → http://localhost:5173  (pid: $(lsof -t -i:5173 2>/dev/null || echo 'starting...'))"
echo "  app     → http://localhost:5174  (pid: $(lsof -t -i:5174 2>/dev/null || echo 'starting...'))"
echo "  agent   → http://localhost:3000  (pid: $(lsof -t -i:3000 2>/dev/null || echo 'starting...'))"
echo ""
echo "Logs: $LOGS/"
