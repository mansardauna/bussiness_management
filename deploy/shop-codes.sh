#!/usr/bin/env bash
# Ma Caisse — manage shop access codes on the VPS (installed as `macaisse-shops`).
#   sudo macaisse-shops add "Grace Depot"     create a code for a new shop and print it
#   sudo macaisse-shops list                  list shops (codes partly hidden)
#   sudo macaisse-shops show "Grace Depot"    print the full code of a shop again
#   sudo macaisse-shops revoke <code|start>   stop accepting a code (stored backups stay)
#   sudo macaisse-shops ifb "Grace Depot"     connect the shop's IFB Payment Page (webhook URL + secret)
#   sudo macaisse-shops ifb-off "Grace Depot" stop receiving IFB payments for that shop
# The server re-reads these files by itself: no restart needed.
set -euo pipefail
F="${SHOPS_FILE:-/etc/macaisse-backup/shops.txt}"
I="${IFB_FILE:-$(dirname "$F")/ifb.json}"
if [ -z "${SHOPS_FILE:-}" ]; then
  [ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
  [ -f "$F" ] || { install -d -o root -g macaisse -m 750 "$(dirname "$F")"; touch "$F"; chown root:macaisse "$F"; chmod 640 "$F"; }
fi
touch "$F"
entries() { grep -E '^[A-Za-z0-9_-]{16,}' "$F" || true; }
case "${1:-}" in
  add)
    name="${2:?Give the shop name: add \"Shop name\"}"
    [[ "$name" != *$'\n'* && "$name" != *'#'* ]] || { echo "The name cannot contain # or line breaks."; exit 1; }
    code=$(head -c 18 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')
    printf '%s  # %s · added %s\n' "$code" "$name" "$(date +%F)" >> "$F"
    echo "Access code for $name: $code"
    ;;
  list)
    n=$(entries | wc -l | tr -d ' ')
    [ "$n" -gt 0 ] || { echo "No shops yet. Add one: sudo macaisse-shops add \"Shop name\""; exit 0; }
    echo "$n shop(s):"
    entries | sed -E 's/^([A-Za-z0-9_-]{6})[A-Za-z0-9_-]*[[:space:]]*#?[[:space:]]*/  \1…  /'
    ;;
  show)
    name="${2:?Give the shop name}"
    m=$(entries | grep -F "# $name ·" || true)
    [ -n "$m" ] || { echo "No shop called \"$name\"."; exit 1; }
    echo "$m" | awk '{print $1}'
    ;;
  revoke)
    key="${2:?Give the code (or its first 6 characters, as shown by list)}"
    [[ "$key" =~ ^[A-Za-z0-9_-]{6,}$ ]] || { echo "That is not a valid code."; exit 1; }
    n=$(entries | grep -c "^$key" || true)
    [ "$n" = 1 ] || { echo "$n codes start with \"$key\": give more characters."; exit 1; }
    tmp=$(mktemp); grep -v "^$key" "$F" > "$tmp" || true; cat "$tmp" > "$F"; rm -f "$tmp"
    echo "Revoked. That shop can no longer send or restore backups; files already stored stay on the server."
    ;;
  ifb)
    name="${2:?Give the shop name: ifb \"Shop name\"}"
    code=$(entries | grep -F "# $name ·" | awk '{print $1}' | head -1)
    [ -n "$code" ] || { echo "No shop called \"$name\". Add it first: macaisse-shops add \"$name\""; exit 1; }
    domain="${MACAISSE_DOMAIN:-$(sed -n 's#^ALLOW_ORIGIN=https://##p' "$(dirname "$F")/server.env" 2>/dev/null)}"
    [ -n "$domain" ] || { echo "Unknown domain: set MACAISSE_DOMAIN=your.domain.com"; exit 1; }
    hook=$(head -c 18 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')
    echo "1. In the IFB app: Services → Payment Pages → the page of $name → Webhook URL. Paste:"
    echo "     https://$domain/ifb/$hook"
    echo "2. Save the page. IFB shows the webhook secret once: copy it."
    printf "3. Paste the webhook secret here (it stays hidden), then press Enter: "
    IFS= read -rs secret || true; echo
    [ "${#secret}" -ge 8 ] || { echo "That does not look like a webhook secret. Nothing was saved."; exit 1; }
    folder=$(printf '%s' "$code" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-24)
    [ -f "$I" ] || { touch "$I"; [ -n "${SHOPS_FILE:-}" ] || { chown root:macaisse "$I"; chmod 640 "$I"; }; }
    IFB_FILE="$I" HOOK="$hook" SECRET="$secret" FOLDER="$folder" NAME="$name" node -e '
      const fs = require("fs"), e = process.env; let j = {};
      try { j = JSON.parse(fs.readFileSync(e.IFB_FILE, "utf8") || "{}"); } catch {}
      for (const k of Object.keys(j)) if (j[k].name === e.NAME) delete j[k];
      j[e.HOOK] = { secret: e.SECRET, folder: e.FOLDER, name: e.NAME, added: new Date().toISOString().slice(0, 10) };
      fs.writeFileSync(e.IFB_FILE, JSON.stringify(j, null, 1));'
    echo "Saved. IFB payments for $name now reach this server. In the app: Settings → IFB payments."
    ;;
  ifb-off)
    name="${2:?Give the shop name}"
    [ -f "$I" ] || { echo "No IFB connection yet."; exit 0; }
    IFB_FILE="$I" NAME="$name" node -e '
      const fs = require("fs"), e = process.env; const j = JSON.parse(fs.readFileSync(e.IFB_FILE, "utf8") || "{}"); let n = 0;
      for (const k of Object.keys(j)) if (j[k].name === e.NAME) { delete j[k]; n++; }
      fs.writeFileSync(e.IFB_FILE, JSON.stringify(j, null, 1)); console.log(n ? "IFB disconnected for " + e.NAME + ". Remove the Webhook URL in the IFB app too." : "That shop had no IFB connection.");'
    ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
