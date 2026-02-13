#!/usr/bin/env bash

PR_NUMBER="${1:?Usage: preview-stop.sh <PR_NUMBER> <PREVIEW_DIR>}"
PREVIEW_DIR="${2:?Usage: preview-stop.sh <PR_NUMBER> <PREVIEW_DIR>}"

if [ -f "$PREVIEW_DIR/docker-compose.yml" ]; then
  cd "$PREVIEW_DIR"
  docker compose down --remove-orphans
  echo "Stopped preview containers for PR #${PR_NUMBER}"
else
  echo "No docker-compose.yml found for PR #${PR_NUMBER}"
fi
