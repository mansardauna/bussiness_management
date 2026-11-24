# Ma Caisse — offline shop management

Android web app (PWA) for a small shop or drinks depot: cash book in **dollars and francs**, sales with receipts, customer and supplier credits with reminders, stock, **packaging (bottles and crates)**, staff and subcontractors, invoices, taxes and fees, day / month / year reports, and an analysis of weak points with advice.

**Languages:** English (default), French, Spanish. Change it from the globe button in the top bar or under Settings → Language.
**Works without internet.** Data stays on the phone (IndexedDB). Manual backup to a `.json` file, which can be sent through WhatsApp or saved to Drive.

## Files
- `index.html`: app shell (sidebar, top bar, phone navigation)
- `app.css`: design system (colours, cards, tables, forms, responsive layout)
- `i18n.js`: translations (key = English text, value = [French, Spanish])
- `core.js`: utilities, language engine, embedded SVG icons (Lucide style, offline), data, components, charts
- `security.js`: users (owner / cashier), PIN codes, owner approval, activity log, automatic lock
- `cloud.js`: encrypted cloud backup and restore
- `print.js`: receipts on Bluetooth thermal printers (ESC/POS, 58 / 80 mm)
- `ifb.js`: IFB payments (Infinite Future Bank / DEUS): pay sheet, automatic matching
- `auto.js`: automatic payments, daily closing, order suggestions, notifications
- `notify-core.js`: what needs attention + order plan (shared by the app and the service worker)
- `qr.js`: QR code generator (written for this app, no dependency)
- `privacy.html`: privacy policy (EN / FR / ES), needed for the Play Store
- `server/backup-server.mjs`: small backup server (Node 18+, no dependencies)
- `deploy/`: one-command install on your own VPS (Caddy + HTTPS, system service, shop codes)
- `deploy/android/`: Play Store app build (Trusted Web Activity) and store listing texts
- `tests/`: unit and end-to-end tests (`npm run test:all`, no dependencies)
- `app.js`: screens, actions and router
- `sw.js`: offline mode (service worker)
- `manifest.webmanifest`, `icons/`: home-screen install
- `ROADMAP.md`: what to do to turn this into a real MVP

## Put it on the client's phone
Offline mode and installation need an **https** address once:
1. Host the folder for free: drag and drop it onto **Netlify Drop** (app.netlify.com/drop), or use GitHub Pages or Cloudflare Pages.
2. On the Android phone, open the link in **Chrome** → menu ⋮ → **Add to Home screen** (or the "Install now" button in Settings).
3. From then on, the app opens and works **without internet**.

To test on a computer, run `python3 -m http.server 8765` in this folder, then open http://localhost:8765.
Useful links:
- `?demo`: loads sample data if the device is empty, e.g. http://localhost:8765/?demo
- `?lang=fr` / `?lang=es` / `?lang=en`: opens in that language, e.g. http://localhost:8765/?demo&lang=fr

## Team, sign-in & roles
- **First launch** (empty phone): a setup page asks for the shop name, the owner's name, the exchange rate and a 4-digit PIN. "Try with sample data first" skips it.
- Without accounts the app works as before: one person, no lock.
- **Demo accounts** (for showing the app): "Add demo accounts" on the dashboard, in More or in Settings → Team & access, or open `/?demo&team` on an empty phone. It adds Marie (owner, PIN 1111), Paul (manager, 2222), Jean and Grâce (sales staff, 3333), Didier (store manager, 4444), Esther (accountant, 5555) and Bosco (auditor, 6666). The sign-in page shows these PINs until a person's PIN is changed. Don't use them for a real shop.
- With accounts, the app opens on a **sign-in page**: "Who is working?" shows everyone as a tile; tap your name, type your PIN. Every sign-in is written in the activity log.
- **Settings → Team & access → Add a person**, then pick a role. Each role has its own home screen, menu and bottom tabs:

| Role | Home screen | Can do |
|---|---|---|
| Owner | Dashboard | Everything, including team, settings, backups |
| Manager | Dashboard | All daily work, reports, activity log, approvals; no team or settings |
| Sales staff | My shift: my sales today, cash in the till, customers to call | Sell, cash book, credits, packaging, count and close the till |
| Store manager | Stock overview: what to reorder, stock value, empties, stock moves | Add / edit products, restock, stock counts, packaging, send orders |
| Accountant | Money overview: balances, month in/out, who owes, payments coming | Cash book, credits, invoices, staff pay, reports, analysis |
| Auditor | Audit overview: voids, discounts, cash short, days not closed | Sees everything, changes nothing (read only) |

- **Log out**: the padlock in the top bar, the profile menu (top right) or the account box at the top of **More** on a phone. The app also logs out by itself after the auto-lock time.
- Without accounts, the dashboard and **More** show a "No accounts yet → Set up accounts" box.
- Buttons a role may not use are hidden, and blocked even if forced.
- Sensitive actions (voiding a sale, editing or deleting money, a discount, correcting the till) need the **PIN of an owner or manager** typed on the same phone, unless the person's role already allows it (a store manager edits products without asking).
- Nothing about money is ever erased: deleted items are marked as voided and kept. The **Activity log** shows who did what, when, and who approved it. Each receipt shows who served the customer.
- The app locks after inactivity (5 minutes by default). After 5 wrong PINs it waits 30 seconds.
- PINs are hashed with PBKDF2. A 4-digit PIN is a lock for people in the shop, not strong encryption.

## Cloud backup
The phone encrypts everything (data + photos) with a **backup password** before sending it (PBKDF2-SHA256 → AES-GCM-256). The server stores files it cannot read. Without the password nobody can restore, so the owner must write it down.

### Deploy on your own VPS (app + backup server, one HTTPS address)
Everything is in `deploy/`. Caddy serves the app and gets the HTTPS certificate automatically; the backup server runs as a locked-down system service that only Caddy can reach.

**You need:** a VPS with Ubuntu 22.04/24.04 or Debian 12 (1 GB RAM is plenty), SSH access with a user that can `sudo`, and a domain name.

1. **DNS:** create an `A` record, e.g. `macaisse.yourdomain.com` → the VPS IP address. Wait until it resolves.
2. **Provider firewall:** allow ports 80 and 443 (and keep SSH open).
3. **From this folder on your computer:**
   ```
   ./deploy/deploy.sh root@VPS_IP macaisse.yourdomain.com "Grace Depot"
   ```
   It checks the code, copies the files, installs Node.js 20 and Caddy, sets up the service, publishes the app, creates the first shop access code and prints it, then tests `https://macaisse.yourdomain.com`.
4. **On the shop's phone:** open `https://macaisse.yourdomain.com` in Chrome → Add to Home screen. Then Settings → Cloud backup → Connect. The server address is filled in already; type the access code and choose the backup password.

**Updating the app:** change the files, bump `VERSION` in `sw.js`, run the same `deploy.sh` command again. Data and access codes are kept.

**Shop access codes** (on the VPS; no restart needed):
```
sudo macaisse-shops add "Bar Le Palmier"     # new shop: prints its code
sudo macaisse-shops list                     # codes partly hidden
sudo macaisse-shops show "Bar Le Palmier"    # print a code again
sudo macaisse-shops revoke no4c4p            # stop a code (first 6 characters are enough)
```

**What is where on the VPS:** app in `/var/www/macaisse`, server in `/opt/macaisse-backup`, encrypted backups in `/var/lib/macaisse-backup` (last 30 per shop), codes in `/etc/macaisse-backup/shops.txt`, logs with `journalctl -u macaisse-backup -f`.
**Back up the backups:** copy `/var/lib/macaisse-backup` somewhere else regularly (another server, or your provider's snapshots). The files are encrypted, so storing them anywhere is safe.
If port 80/443 is already used by nginx or Apache, the setup stops and explains why; `deploy/Caddyfile` shows the two rules to copy into your own web server.

**Without the VPS scripts** the server runs anywhere with Node 18+ behind HTTPS:
`BACKUP_TOKENS_FILE=./shops.txt PORT=8787 DATA_DIR=./backup-data ALLOW_ORIGIN=https://your-app-address node server/backup-server.mjs`
API: `PUT /backup` and `GET /backup` (latest) with `Authorization: Bearer <access code>`; `GET /health` returns `ok`.

**On the phone:** Settings → Cloud backup → Connect, then enter the server address, access code and backup password. The first backup is sent right away to test the connection. After that, a backup is sent when something has changed: at most every 30 minutes, and when the app is closed.
**New phone:** Settings → Cloud backup → Restore from the cloud, using the same three details.

## What the app does by itself
- **Automatic payments:** a reminder with an expense category and "Record the payment by itself" (rent, subscriptions…) is written into the cash book on its day, every month. If the app was not opened for a while, the missed months are caught up when it opens. **Staff → Pay salaries automatically** does the same for every employee's salary (day 28 by default).
- **Daily closing:** Cash book → **Close the day**. Shows today's sales and profit; the cashier counts the cash, and the app shows any surplus or shortage and prepares a summary for the owner's WhatsApp (Settings → Owner's WhatsApp). Alerts when yesterday was not closed, at closing time, and when a closing was short this week.
- **Order suggestions:** Products → **What to order**: based on the last 14 days of sales, enough for 7 days after a delivery (delivery time in Settings → Automation), rounded up to the product's pack (crate of 12…). **Order from <supplier>** opens WhatsApp with the order written. Products below their minimum are always listed.
- **Phone notifications:** Settings → Automation → Turn on notifications. Once a day the app checks: late credits, supplier debts, reminders due, stock to order, a day not closed, IFB payments to match. On an installed app in Chrome for Android this also works when the app is closed (Chrome's daily background check, at a time Chrome chooses); otherwise it runs while the app is open in the background.
- Already automatic before: stock, cash book, credits and receipts on each sale; voids; reports and advice; alerts; IFB payment matching; encrypted backups; auto-lock; activity log.

## IFB payments (Infinite Future Bank · DEUS)
Customers pay a sale, a credit or an invoice by **card, mobile money, Paystack or IFB wallet** on the shop's IFB Payment Page. The app settles it by itself.

**How it works**
1. Cashier chooses **IFB** at checkout (or "Pay with IFB" on a credit or an invoice). The app shows a QR code, the **amount in dollars** and a **reference** (R-00012 for a sale, C-0007 for a credit, F-0003 for an invoice). Invoices print with the QR code and reference.
2. The customer scans, types the amount and reference on the IFB page, and pays. They do not need an IFB account.
3. IFB sends a signed `order.paid` webhook to **your VPS** (`/ifb/<id>`). The server checks the signature with the shop's webhook secret, which stays on the server, and keeps only amount, fee, reference, payer name and dates for 90 days.
4. The phone asks the server for new payments (every few seconds while the QR is shown, every minute while something waits, otherwise every 10 minutes) and **settles the match**: sale marked paid, credit closed, invoice paid (or part-paid), money in the **IFB till** (USD), fee recorded if the shop pays it, entry in the activity log. References are matched however the customer types them (`r12` = `R-00012`).
5. A payment with an unknown reference still lands in the IFB till, with an alert so the owner can link it to the right customer (Cash book → the payment → Link).

**Set up (once per shop)**
1. In the IFB app (DEUS): Services → Payment Pages → New page, pricing **Customer enters amount**, and a required text field with the id `order_reference` ("Reference").
2. On the VPS: `sudo macaisse-shops ifb "Grace Depot"` prints the **Webhook URL** to paste into the IFB page, then asks for the **webhook secret** IFB shows after saving.
3. In the app: connect **Cloud backup** (same server and access code), then Settings → IFB payments → paste the page link and choose who pays the 1.5 % fee.
4. Test with a real $1 payment from another person's card or IFB account (IFB has no test mode yet).

**Prefilled links:** the QR code and shared link carry the amount and reference (`?amount=12.40&ref=R-00012&lock=1`). IFB pages with the prefill update (branch `feat/payment-page-prefill`, not deployed yet) fill them in; older pages ignore them and the customer types them.

**Current IFB limits** (from the IFB partner guide): USD only, $1 minimum, and until the IFB update ships, the customer types the amount and reference and a webhook is sent once with no retry. If the server was down, the payment is still in the IFB app (Payment Pages → Orders): record it in the app with "Customer pays" → IFB. When IFB's Merchant API v1 ships, the app can create exact-amount payments and these limits go away.

## Receipt printer
Settings → Receipt printer. Three ways to print:
- **Phone print dialog** (default): works with any printer Android can print to.
- **Bluetooth printer**: printers that support Bluetooth LE, directly from Chrome on Android (Web Bluetooth). Tap "Connect the printer" once.
- **RawBT app**: for most cheap "classic" Bluetooth 58 mm printers. Install the free RawBT app from the Play Store, pair the printer in it, then choose RawBT in Ma Caisse.

Options: 58 or 80 mm paper, with or without accents (code page 850; choose "Without accents" if letters print wrong), print automatically after each sale. "Test print" prints a sample ticket with accents and a width ruler.
Not yet tested with a physical printer: try the test print on the client's model before the pilot.

## Android app (Play Store)
The Play Store app is a **Trusted Web Activity**: a thin Android shell that opens your online app full screen, with offline mode, printing and updates all coming from the website.
1. Deploy the app on your VPS (above) and fill in the two **EDIT** lines in `privacy.html`.
2. `./deploy/android/build-android.sh macaisse.yourdomain.com` creates the Android project (first time: a few questions and a **signing key**: keep `android-app/android.keystore` and its passwords safe forever), builds the `.aab`, and writes `.well-known/assetlinks.json`.
3. Deploy again so `assetlinks.json` is online, then upload the `.aab` in the Play Console.
4. `deploy/android/STORE-LISTING.md` has the store texts in 3 languages, the data safety answers and the release checklist.
The signing key is never uploaded by `deploy.sh`.

## Tests
```
npm test            # unit tests: money logic, languages, roles & PINs, encryption, printer, backup server (~3 s)
npm run test:e2e    # the real app in headless Chrome: every screen in 3 languages, sale/void, cashier & approvals (~40 s)
npm run test:all
```
No packages to install (Node 20+ and Google Chrome or Chromium; set `CHROME=/path` if not found). The translation test fails if any text has no French or Spanish version.

## Languages
- Code is written in English; every visible text goes through `t('English text')`.
- `i18n.js` holds `'English text': ['French', 'Spanish']`. Plurals use `'one|other'` (for example `'{n} sale|{n} sales'`), and variables use `{name}`.
- **Adding a language** (for example Lingala or Swahili): add a third column to `i18n.js`, then add an entry to `LANGS` and `DATES` in `core.js`. A check script can list missing keys (see `TR_MISSING` in the browser console after visiting the screens).
- Categories, payment methods and stock reasons are stored as fixed ids (`sales`, `rent`, `cash`…), so changing the language never changes the data. Text typed by the user (product names, notes) stays as typed.
- Data from version 1, which was French only, is converted automatically on first launch and keeps French as its language.

## Update the app
Change the files, then bump `VERSION` in `sw.js` (for example `macaisse-v4`) and publish again. Phones get the new version on the second launch with internet. Data is not touched.

## How profit is calculated
Net profit = sales (+ invoices) − cost of the goods sold − expenses (salaries, subcontractors, taxes, rent, transport, fees…) − stock losses.
"Stock purchases", "Currency exchange", "Debt repayment" and "Owner withdrawal" are money going out of the till, but they are **not** expenses (no double counting).

## Known limits
- Automatic reading of papers (OCR) needs internet the first time to download the engine. The photo is always kept as proof, and the amount can be typed by hand.
- Data on the phone itself is not encrypted; the PIN is a lock screen. Cloud backups are encrypted.
- Several phones cannot yet work on the same data at the same time (sync is a later step). Cloud backup is one-way: phone → server, and restore.
- Mixed payment ($ + FC) for one sale: record the sale in one currency, then use "Exchange" if needed.
