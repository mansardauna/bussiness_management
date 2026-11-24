#!/usr/bin/env bash
# Ma Caisse — set up a VPS to host the app AND the encrypted backup server on one HTTPS address.
# Tested target: Ubuntu 22.04 / 24.04, Debian 12. Safe to run again (it updates and keeps your data and codes).
#
# Normally started by deploy/deploy.sh from your computer. By hand, on the VPS:
#   sudo bash deploy/setup-vps.sh your.domain.com ["First shop name"]
set -euo pipefail

DOMAIN="${1:?Usage: setup-vps.sh your.domain.com [\"First shop name\"]}"
FIRST_SHOP="${2:-}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/var/www/macaisse
SRV_DIR=/opt/macaisse-backup
DATA_DIR=/var/lib/macaisse-backup
CONF_DIR=/etc/macaisse-backup
SHOPS="$CONF_DIR/shops.txt"
say() { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root (sudo)."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || die "\"$DOMAIN\" does not look like a domain name."
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) die "This script supports Ubuntu and Debian only (found: $ID)." ;; esac
[ -f "$SRC/index.html" ] && [ -f "$SRC/server/backup-server.mjs" ] || die "Run it from the Ma Caisse project folder."

say "Checking that ports 80 and 443 are free for Caddy"
busy=$(ss -ltnpH '( sport = :80 or sport = :443 )' 2>/dev/null | grep -v caddy || true)
[ -z "$busy" ] || die "Another program uses port 80/443 (nginx? apache?):
$busy
Stop it, or put Ma Caisse behind that web server yourself (see deploy/Caddyfile for the rules)."

say "Installing packages (Node.js 20, Caddy)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg rsync debian-keyring debian-archive-keyring apt-transport-https >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "node $(node -v), $(caddy version | cut -d' ' -f1)"

say "Installing the backup server"
id macaisse >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --no-create-home --shell /usr/sbin/nologin macaisse
install -d -o macaisse -g macaisse -m 700 "$DATA_DIR"
install -d -o root -g macaisse -m 750 "$CONF_DIR"
install -d -m 755 "$SRV_DIR"
install -m 644 "$SRC/server/backup-server.mjs" "$SRV_DIR/backup-server.mjs"
install -m 755 "$SRC/deploy/shop-codes.sh" /usr/local/bin/macaisse-shops
printf 'ALLOW_ORIGIN=https://%s\n' "$DOMAIN" > "$CONF_DIR/server.env"; chmod 640 "$CONF_DIR/server.env"; chgrp macaisse "$CONF_DIR/server.env"
touch "$SHOPS"; chown root:macaisse "$SHOPS"; chmod 640 "$SHOPS"
[ -s "$CONF_DIR/ifb.json" ] || echo "{}" > "$CONF_DIR/ifb.json"; chown root:macaisse "$CONF_DIR/ifb.json"; chmod 640 "$CONF_DIR/ifb.json"
sed "s#__NODE__#$(command -v node)#" "$SRC/deploy/macaisse-backup.service" > /etc/systemd/system/macaisse-backup.service
systemctl daemon-reload
systemctl enable --quiet macaisse-backup
systemctl restart macaisse-backup

say "Publishing the app"
install -d -m 755 "$APP_DIR"
rsync -a --delete --exclude deploy --exclude server --exclude tests --exclude android-app --exclude '*.keystore' --exclude '*.jks' --exclude package.json --exclude .claude --exclude .git --exclude '*.md' --exclude .DS_Store "$SRC/" "$APP_DIR/"
chmod -R a+rX "$APP_DIR"

say "Configuring Caddy (automatic HTTPS) for $DOMAIN"
install -d -m 755 /etc/caddy/sites
sed "s#__DOMAIN__#$DOMAIN#g" "$SRC/deploy/Caddyfile" > /etc/caddy/sites/macaisse.caddy
if ! grep -q '^import sites/\*' /etc/caddy/Caddyfile 2>/dev/null; then
  if [ -f /etc/caddy/Caddyfile ] && grep -q 'The Caddyfile is an easy way' /etc/caddy/Caddyfile; then
    cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.original
    echo 'import sites/*' > /etc/caddy/Caddyfile          # replace Caddy's welcome page
  else
    [ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
    printf '\nimport sites/*\n' >> /etc/caddy/Caddyfile    # keep the sites already there
  fi
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || die "Caddy configuration is not valid (see above)."
systemctl enable --quiet caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  say "Opening ports 80 and 443 in the firewall (ufw)"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

if ! grep -qE '^[A-Za-z0-9_-]{16,}' "$SHOPS"; then
  say "Creating the first shop access code"
  macaisse-shops add "${FIRST_SHOP:-Shop 1}"
fi

say "Checking"
ok=1
for i in 1 2 3 4 5; do curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8787/health >/dev/null 2>&1 && echo "backup server: running" || { warn "backup server is not answering: journalctl -u macaisse-backup -n 50"; ok=0; }
myip=$(hostname -I 2>/dev/null | awk '{print $1}'); dnsip=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
[ -n "$dnsip" ] || warn "$DOMAIN does not resolve yet. Create a DNS A record pointing to this server, then wait a few minutes."
https_ok=0
for i in $(seq 1 12); do curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1 && { https_ok=1; break; }; sleep 5; done
if [ $https_ok = 1 ]; then echo "https://$DOMAIN: working (certificate OK)"
else warn "https://$DOMAIN is not reachable yet. Check the DNS record (it points to ${dnsip:-nothing}; this server is ${myip:-?}) and that ports 80/443 are open in your provider's firewall. Caddy retries by itself: journalctl -u caddy -n 50"; ok=0; fi

cat <<EOF

────────────────────────────────────────────────────────────
 Ma Caisse is installed.
   App (open on the phone in Chrome):  https://$DOMAIN
   In the app: Settings → Cloud backup → Connect
     Server address:  https://$DOMAIN
     Access code:     see below (one per shop)
     Backup password: chosen by the shop owner — never sent, write it down

 Shop access codes:   sudo macaisse-shops list | add "Name" | show "Name" | revoke CODE
 IFB payments:        sudo macaisse-shops ifb "Name"   (connects the shop's IFB Payment Page)
 Server logs:         journalctl -u macaisse-backup -f
 Stored backups:      $DATA_DIR (encrypted; also copy this folder elsewhere)
────────────────────────────────────────────────────────────
EOF
macaisse-shops list
[ $ok = 1 ] || exit 2
