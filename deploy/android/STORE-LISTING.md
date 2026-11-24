# Play Store listing — Ma Caisse

Ready-to-paste texts. Play Console → Grow → Store presence → Main store listing (add French and Spanish as translations).

## App details
| | |
|---|---|
| App name (30 max) | Ma Caisse – Shop management |
| Category | Business |
| Tags | Point of sale, Accounting, Inventory |
| Privacy policy URL | `https://<your-domain>/privacy.html` (fill in the two **EDIT** lines in `privacy.html` first) |
| Contains ads | No |
| Content rating questionnaire | Business / utility app, no user-generated content shared with others → rated for everyone |
| Target audience | 18+ (business tool, not for children) |

## Short description (80 characters max)
- **EN:** Cash, sales, credits and stock for small shops. Works offline. $ and FC.
- **FR:** Caisse, ventes, crédits et stock pour petits commerces. Marche sans internet.
- **ES:** Caja, ventas, créditos y stock para pequeños comercios. Funciona sin internet.

## Full description
**EN**
Ma Caisse helps small shops and drinks depots know exactly where their money is, every day.
• Sell in seconds: tap products, take cash, Mobile Money, card or credit, give a receipt (print or WhatsApp).
• Cash book in dollars and francs, with the day's exchange rate.
• Customer credits and supplier debts, with SMS and WhatsApp reminders.
• Stock, stock counts and losses; returnable bottles and crates.
• Staff and subcontractor payments, invoices, tax reminders.
• Reports by day, month and year; business health score with clear advice.
• Owner and cashier accounts: voids, deletions, discounts and price changes need the owner's PIN. An activity log shows who did what.
• Works without internet. Optional encrypted cloud backup.
• English, French and Spanish.

**FR**
Ma Caisse aide les petits commerces et dépôts de boissons à savoir exactement où est leur argent, chaque jour.
• Vendez en quelques secondes : touchez les produits, encaissez en espèces, Mobile Money, carte ou crédit, donnez un reçu (imprimé ou WhatsApp).
• Caisse en dollars et en francs, avec le taux du jour.
• Crédits clients et dettes fournisseurs, avec rappels SMS et WhatsApp.
• Stock, inventaires et pertes ; bouteilles et casiers consignés.
• Paiement du personnel et des sous-traitants, factures, rappels d’impôts.
• Rapports par jour, mois et année ; note de santé du commerce et conseils clairs.
• Comptes propriétaire et caissier : annulations, suppressions, remises et changements de prix demandent le code du propriétaire. Un journal montre qui a fait quoi.
• Fonctionne sans internet. Sauvegarde en ligne chiffrée en option.
• Anglais, français et espagnol.

**ES**
Ma Caisse ayuda a pequeños comercios y depósitos de bebidas a saber exactamente dónde está su dinero, cada día.
• Venda en segundos: toque los productos, cobre en efectivo, dinero móvil, tarjeta o crédito, dé un recibo (impreso o por WhatsApp).
• Caja en dólares y francos, con la tasa del día.
• Créditos de clientes y deudas con proveedores, con recordatorios por SMS y WhatsApp.
• Stock, inventarios y pérdidas; botellas y cajas retornables.
• Pagos al personal y subcontratistas, facturas, recordatorios de impuestos.
• Informes por día, mes y año; nota de salud del negocio y consejos claros.
• Cuentas de propietario y cajero: anulaciones, borrados, descuentos y cambios de precio requieren el PIN del propietario. Un registro muestra quién hizo qué.
• Funciona sin internet. Copia en la nube cifrada opcional.
• Inglés, francés y español.

## Graphics to prepare
- App icon 512×512: `icons/icon-512.png`
- Feature graphic 1024×500 (indigo background, logo, "Ma Caisse" + one line)
- Phone screenshots, at least 2, ideally 4–6, portrait: Point of sale with a cart, Receipt, Dashboard, Credits, Reports, Activity log. Take them with `?demo` data in each language.

## Data safety form (Play Console → App content → Data safety)
How the app works, to answer the form correctly:
- Everything is stored **on the device**. No account, no ads, no analytics SDK.
- **Optional** cloud backup: the device encrypts all data (AES-256, password known only to the business) and sends it to your backup server over HTTPS.

Recommended answers (the cautious reading — check against Google's current definitions):
- Does your app collect or share user data? **Yes** (because of the optional cloud backup).
- Data types: **Financial info → Purchase history** and **Other financial info**; **Photos and videos → Photos** (papers attached to transactions); **Personal info → Name, Phone number** (customers' names and numbers typed by the shop).
- For each: Collected **yes**, Shared **no**; **Optional** (user can choose); Purpose **App functionality** (and **Account management** not needed); Processed ephemerally **no**.
- Is data encrypted in transit? **Yes**.
- Can users request deletion? **Yes**: in-app "Erase everything"; backups on request (contact in the privacy policy).
Note: Google exempts some end-to-end encrypted data from "collected"; if you rely on that, read their current guidance first. Declaring it is the safe choice.

## Release checklist
1. App online over HTTPS (`deploy/deploy.sh`), `privacy.html` edited.
2. `./deploy/android/build-android.sh <domain>` → `.aab` + `assetlinks.json`, then deploy again.
3. Play Console: create app → **Internal testing** → upload `.aab` → install on 2–3 real phones (Tecno / Itel / Infinix).
4. Add the Play **App signing** SHA-256 to `assetlinks.json` (see the build script's output); check the app opens **without** a browser address bar.
5. Store listing, content rating, data safety, target audience → **Closed testing** with the pilot shops → Production.
