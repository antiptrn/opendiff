#!/usr/bin/env bash

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="${1:-dev}"

if [ "$MODE" = "prod" ]; then
  docker compose -f "$ROOT/docker-compose.prod.yml" down
  exit 0
fi

KILLED=0

for PORT in 3000 3001 5173 5174; do
  PIDS=$(lsof -t -i:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null
    KILLED=$((KILLED + 1))
  fi
done

if [ "$KILLED" -gt 0 ]; then
  echo "Stopped $KILLED service(s)"
else
  echo "No services running"
fi
