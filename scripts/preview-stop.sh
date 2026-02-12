#!/usr/bin/env bash

PR_NUMBER="${1:?Usage: preview-stop.sh <PR_NUMBER>}"

BFF_PORT=$((10000 + PR_NUMBER))
WEBSITE_PORT=$((20000 + PR_NUMBER))
APP_PORT=$((30000 + PR_NUMBER))
AGENT_PORT=$((40000 + PR_NUMBER))

KILLED=0

for PORT in $BFF_PORT $WEBSITE_PORT $APP_PORT $AGENT_PORT; do
  PIDS=$(lsof -t -i:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null
    KILLED=$((KILLED + 1))
  fi
done

if [ "$KILLED" -gt 0 ]; then
  echo "Stopped $KILLED preview service(s) for PR #${PR_NUMBER}"
else
  echo "No preview services running for PR #${PR_NUMBER}"
fi
