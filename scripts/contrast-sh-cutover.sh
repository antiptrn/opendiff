#!/usr/bin/env bash
# Moves production to contrast.sh. Run on the Pi:
#   ssh raspberry-pi-5 'bash -s' < scripts/contrast-sh-cutover.sh
#
# 1. Adds the contrast.sh hostnames to the production tunnel and restarts it.
# 2. Stops unless https://contrast.sh answers through the tunnel (the nameservers have to be live).
# 3. Points the site, app and bff at contrast.sh, keeps OAuth callbacks on api.opendiff.dev (so
#    no provider settings change), and rebuilds and restarts those three containers.
# Every file it changes is backed up next to itself with a timestamp first.
set -euo pipefail

DEPLOY_DIR="/home/j/developer/opendiff"
TUNNEL_CONFIG="/etc/cloudflared/config.yml"
STAMP="$(date +%Y%m%d%H%M%S)"

echo "== 1. Tunnel hostnames"
if grep -q "contrast.sh" "$TUNNEL_CONFIG"; then
  echo "already has contrast.sh"
else
  sudo cp "$TUNNEL_CONFIG" "$TUNNEL_CONFIG.bak-$STAMP"
  sudo python3 - "$TUNNEL_CONFIG" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
anchor = "  - hostname: agent.opendiff.dev\n    service: http://localhost:3000\n"
assert anchor in text, "agent.opendiff.dev entry not found"
hosts = [
    ("contrast.sh", "http://localhost:5173"),
    ("www.contrast.sh", "http://localhost:5173"),
    ("app.contrast.sh", "http://localhost:5174"),
    ("api.contrast.sh", "http://localhost:3001"),
    ("agent.contrast.sh", "http://localhost:3000"),
]
added = "".join(f"  - hostname: {h}\n    service: {s}\n" for h, s in hosts)
open(path, "w").write(text.replace(anchor, anchor + added))
EOF
  cloudflared tunnel --config "$TUNNEL_CONFIG" ingress validate
  sudo systemctl restart cloudflared
  sleep 5
fi

echo "== 2. contrast.sh reachable?"
for host in contrast.sh app.contrast.sh api.contrast.sh; do
  if ! curl -fsS -o /dev/null --max-time 15 "https://$host/"; then
    echo "https://$host/ isn't answering yet (nameservers may still be propagating)."
    echo "The tunnel part is done; run this again later to finish."
    exit 1
  fi
  echo "$host ok"
done

# Sets KEY=value in an env file, replacing the line if it exists and appending it if not
set_env() {
  local file="$1" key="$2" value="$3"
  python3 - "$file" "$key" "$value" <<'EOF'
import sys
path, key, value = sys.argv[1:]
lines = open(path).read().splitlines()
out, found = [], False
for line in lines:
    if line.startswith(key + "="):
        out.append(f"{key}={value}")
        found = True
    else:
        out.append(line)
if not found:
    out.append(f"{key}={value}")
open(path, "w").write("\n".join(out) + "\n")
EOF
}

echo "== 3. Env files"
cd "$DEPLOY_DIR"
for f in apps/site/.env apps/app/.env apps/bff/.env; do cp "$f" "$f.bak-$STAMP"; done

set_env apps/site/.env VITE_API_URL https://api.contrast.sh
set_env apps/site/.env VITE_APP_URL https://app.contrast.sh
set_env apps/site/.env VITE_ALLOWED_HOSTS contrast.sh,.contrast.sh,opendiff.dev,.opendiff.dev

set_env apps/app/.env VITE_API_URL https://api.contrast.sh
set_env apps/app/.env VITE_WEBSITE_URL https://contrast.sh
set_env apps/app/.env VITE_ALLOWED_HOSTS app.contrast.sh,.contrast.sh,app.opendiff.dev,.opendiff.dev
set_env apps/app/.env VITE_THEME_COOKIE_DOMAIN contrast.sh

set_env apps/bff/.env FRONTEND_URL https://app.contrast.sh
set_env apps/bff/.env ALLOWED_ORIGINS https://contrast.sh,https://app.contrast.sh,https://api.contrast.sh,https://opendiff.dev,https://app.opendiff.dev,https://api.opendiff.dev
set_env apps/bff/.env POLAR_SUCCESS_URL "https://app.contrast.sh/subscription/success?checkout_id={CHECKOUT_ID}"
# Provider callbacks stay where GitHub, Google and Microsoft already expect them
set_env apps/bff/.env OAUTH_CALLBACK_BASE_URL https://api.opendiff.dev

echo "== 4. Rebuild and restart site, app and bff"
export GITHUB_PRIVATE_KEY_PATH=/home/j/.ssh/opendiff-app.pem
docker compose -f docker-compose.prod.yml build site app bff
docker compose -f docker-compose.prod.yml up -d --no-deps site app bff
sleep 10
for url in http://localhost:5173/ http://localhost:5174/ http://localhost:3001/; do
  curl -fsS -o /dev/null "$url" && echo "$url ok" || echo "$url FAILED"
done
echo "Done. Backups end in .bak-$STAMP"
