#!/usr/bin/env bash
set -e

CLOUDFLARED_DIR="/home/j/.cloudflared"
INGRESS_DIR="$CLOUDFLARED_DIR/preview-ingress.d"
CONFIG_FILE="$CLOUDFLARED_DIR/preview-tunnel.yml"
PID_FILE="$CLOUDFLARED_DIR/preview-tunnel.pid"
TUNNEL_NAME="opendiff-previews"

# Look up the tunnel UUID by name
TUNNEL_UUID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
if [ -z "$TUNNEL_UUID" ]; then
  echo "Error: Tunnel '$TUNNEL_NAME' not found. Run: cloudflared tunnel create $TUNNEL_NAME"
  exit 1
fi

CREDS_FILE="$CLOUDFLARED_DIR/${TUNNEL_UUID}.json"
if [ ! -f "$CREDS_FILE" ]; then
  echo "Error: Credentials file not found at $CREDS_FILE"
  exit 1
fi

# Kill existing preview tunnel process
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing preview tunnel (PID: $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# Check if there are any ingress fragments
FRAGMENTS=$(ls "$INGRESS_DIR"/*.yml 2>/dev/null || true)

if [ -z "$FRAGMENTS" ]; then
  echo "No preview ingress fragments found. Tunnel will remain stopped."
  rm -f "$CONFIG_FILE"
  exit 0
fi

# Assemble the tunnel config
echo "Assembling preview tunnel config..."

cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_NAME
credentials-file: $CLOUDFLARED_DIR/${TUNNEL_UUID}.json
ingress:
EOF

# Append each fragment's ingress rules
for FRAGMENT in $FRAGMENTS; do
  cat "$FRAGMENT" >> "$CONFIG_FILE"
done

# Append the catch-all rule
cat >> "$CONFIG_FILE" <<EOF
  - service: http_status:404
EOF

echo "Preview tunnel config written to $CONFIG_FILE"

# Start the tunnel
nohup cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" > "$CLOUDFLARED_DIR/preview-tunnel.log" 2>&1 &
TUNNEL_PID=$!
echo "$TUNNEL_PID" > "$PID_FILE"

echo "Preview tunnel started (PID: $TUNNEL_PID)"
