#!/usr/bin/env bash
# Ma Caisse — deploy from your computer to your VPS (first install and every update).
#   ./deploy/deploy.sh user@server-ip your.domain.com ["First shop name"]
# Needs: SSH access to the VPS with a user that can sudo, and a DNS A record for the domain pointing to it.
# Updating the app: change the files, bump VERSION in sw.js, run this again. Data and shop codes are kept.
set -euo pipefail
TARGET="${1:?Usage: ./deploy/deploy.sh user@server your.domain.com [\"First shop name\"]}"
DOMAIN="${2:?Usage: ./deploy/deploy.sh user@server your.domain.com [\"First shop name\"]}"
SHOP="${3:-}"
cd "$(dirname "$0")/.."

for f in index.html sw.js server/backup-server.mjs deploy/setup-vps.sh; do [ -f "$f" ] || { echo "Missing $f — run from the project folder."; exit 1; }; done
for f in *.js server/*.mjs; do node --check "$f" || { echo "Syntax error in $f — not deploying."; exit 1; }; done
echo "App version: $(grep -o "macaisse-v[0-9]*" sw.js | head -1)  (bump it in sw.js when you change the app, or phones keep the old one)"

echo "▸ Copying files to $TARGET"
rsync -az --delete --exclude .git --exclude .claude --exclude backup-data --exclude .DS_Store --exclude android-app --exclude '*.keystore' --exclude '*.jks' --exclude node_modules ./ "$TARGET:macaisse-src/"
echo "▸ Running the setup on the server (it may ask for your sudo password)"
ssh -t "$TARGET" "sudo bash macaisse-src/deploy/setup-vps.sh $(printf '%q' "$DOMAIN") $(printf '%q' "$SHOP")"
