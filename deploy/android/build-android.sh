#!/usr/bin/env bash
# Ma Caisse — build the Android app for the Play Store (a Trusted Web Activity of your online app).
#   ./deploy/android/build-android.sh macaisse.yourdomain.com
#
# Needs: the app online at https://<domain> (deploy/deploy.sh), Node.js, and internet.
# Bubblewrap (Google's tool) offers to download Java 17 and the Android SDK itself the first time.
#
# The first run asks a few questions (app id such as com.yourcompany.macaisse, app name, colours)
# and creates a SIGNING KEY: android-app/android.keystore + two passwords.
#   >>> Keep that file and both passwords safe (2 copies, offline). Without them you can never
#   >>> publish an update of the app on the Play Store.
# The android-app/ folder is never uploaded to the server by deploy.sh.
set -euo pipefail
DOMAIN="${1:?Usage: ./deploy/android/build-android.sh macaisse.yourdomain.com}"
cd "$(dirname "$0")/../.."
command -v npx >/dev/null || { echo "Install Node.js first (https://nodejs.org)."; exit 1; }
curl -fsS --max-time 15 "https://$DOMAIN/manifest.webmanifest" >/dev/null || { echo "https://$DOMAIN is not online yet. Run deploy/deploy.sh first."; exit 1; }

BW="npx --yes @bubblewrap/cli"
mkdir -p android-app && cd android-app
if [ ! -f twa-manifest.json ]; then
  echo "▸ First time: creating the Android project (answer the questions; the defaults are fine)"
  $BW init --manifest "https://$DOMAIN/manifest.webmanifest"
else
  echo "▸ Updating the Android project from the online app"
  $BW update
fi
echo "▸ Building (asks for the signing key passwords)"
$BW build
mkdir -p ../.well-known
$BW fingerprint generateAssetLinks --output=../.well-known/assetlinks.json
cat <<EOF

────────────────────────────────────────────────────────────
 Built:  android-app/app-release-bundle.aab   (upload this to the Play Console)
         android-app/app-release-signed.apk   (install on a phone to test: adb install …)
 Made:   .well-known/assetlinks.json          (lets the app open full screen, without the browser bar)

 Next:
 1. Put assetlinks.json online:  ./deploy/deploy.sh user@server $DOMAIN
    Check: https://$DOMAIN/.well-known/assetlinks.json
 2. Play Console → create the app → upload the .aab (internal testing first).
 3. Play Console → App integrity → copy the "App signing key" SHA-256, then:
      cd android-app && $BW fingerprint add <SHA-256> && $BW fingerprint generateAssetLinks --output=../.well-known/assetlinks.json
    and deploy again. (Google re-signs the app; both keys must be listed.)
 4. Store listing, privacy policy and data safety answers: deploy/android/STORE-LISTING.md
 Keep android-app/android.keystore and its passwords safe.
────────────────────────────────────────────────────────────
EOF
