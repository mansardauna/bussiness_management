# From prototype to real MVP

The current build is a **working prototype**. Every screen works offline, in 3 languages, on one phone. An MVP is something a real shop uses every day for weeks, with real money and no data loss. This plan gets there in about 8–10 weeks.

---

## 1. Decide what the MVP must prove

Pick **one** promise and measure it. Suggested promise:

> "In 2 minutes a day, the owner knows exactly how much cash, credit and stock they should have, and catches losses."

| Metric (pilot, 4 weeks) | Target |
|---|---|
| Days with entries / week | ≥ 6 |
| Sales recorded in the app vs. paper notebook | ≥ 90 % |
| Cash count difference (app vs. real) | < 2 % |
| Customer credit recovered vs. before | +20 % |
| Owner still using it in week 4 | 4 of 5 pilot shops |

**Cut scope for the pilot:** keep Dashboard, Sell, Cash book, Credits, Products, Packaging, Staff and Reports. Hide Invoices, Scanner and Analysis behind a setting until users ask for them. A smaller app is easier to learn.

---

## 2. Blockers before real money goes in (weeks 1–3)

> **Status (Nov 2026):** items 1, 2 and the PIN part of 5 are **built**: encrypted cloud backup + server, owner/cashier accounts, owner approval, activity log, soft deletes, auto-lock. Also built: **tests** (item 6: 28 automated tests, unit + headless Chrome), **receipt printing** (item 4: ESC/POS over Bluetooth LE or the RawBT app), and the **Play Store kit** (item 3: Trusted Web Activity build script, privacy policy, store listing), plus a one-command VPS deployment. Still to do: run the deployment and the Android build, test with a real printer and real phones, encrypt the data stored on the phone itself.

These are risks, not features. Each one can lose the client's trust on day one.

1. **Data loss.** Data lives on one phone, and phones get lost, stolen or reset.
   - Automatic encrypted backup whenever internet is available (Google Drive app-folder, or a small backend such as Supabase or Firebase).
   - Keep the file backup as a fallback.
2. **Two employees plus the owner means control is needed.** This is the main reason the client wants the app ("control of benefits").
   - User accounts with a PIN each: **Owner** sees everything, **Cashier** can only sell and record expenses.
   - Void, delete, price change, stock adjustment and cash correction require the owner's PIN.
   - **Audit log**: who did what and when. Never hard-delete: mark it voided and keep the record.
3. **Real Android app.**
   - Package the PWA as a **Trusted Web Activity** (Bubblewrap) for the Play Store, or use **Capacitor** if you need native features (next point).
   - Test on the phones people actually use: Tecno, Itel and Infinix with Android Go and 2 GB RAM, under bright sunlight, with low battery.
4. **Receipt printing.** Most shops use cheap **58 mm Bluetooth ESC/POS printers**. That needs Capacitor plus a Bluetooth printer plugin; Web Bluetooth isn't reliable for this.
5. **Security basics.** Hash PINs with PBKDF2 (WebCrypto) instead of the current simple hash, encrypt backup files, and add an auto-lock after inactivity.
6. **Tests.** Write unit tests for money logic (profit, credit balance, currency conversion, voids) and end-to-end tests (Playwright) for selling, credit and cash count in all 3 languages. Money bugs kill trust.

---

## 3. UX for low digital literacy (weeks 2–5)

- **First-run wizard** (3 screens): language → business name and today's rate → add 5 products with photos. No empty dashboard.
- **Simple mode for cashiers**: only 3 big buttons (Sell, Expense, Credit). No charts, no settings.
- **Product photos** on the sale tiles, taken with the phone camera. People recognise pictures faster than names.
- **Local languages.** The language system is ready, so each one is a column in `i18n.js`:
  - **Lingala** and **Swahili** first, for DR Congo. Then Tshiluba and Kikongo if needed.
  - Have native speakers who run shops review the wording, not just translators.
- **Voice hints / short videos**: 30-second WhatsApp videos per task, and an optional play button on each screen.
- **Number keypad for francs**: amounts like 125 000 FC are slow to type. Add quick buttons such as +1 000, +5 000 and +10 000.
- **Usability test**: watch 5 real users do 5 tasks without help. Fix every place where they hesitate.

---

## 4. Features that create real value (weeks 5–8)

| Priority | Feature | Why |
|---|---|---|
| ★★★ | ~~Mobile Money confirmation~~ **Built with IFB payments**: card, mobile money, Paystack and IFB wallet, confirmed by signed webhook and matched automatically | Most payments go digital; the owner wants proof |
| ★★★ | **Daily closing** ("Z report"): count cash, compare, sign off by the owner | The #1 anti-theft habit |
| ★★★ | **WhatsApp receipt and credit reminder templates** | Already partly built; make it 1 tap with the customer list |
| ★★ | **Supplier orders**: suggested reorder from sales speed | Avoids running out of best-sellers |
| ★★ | **Multi-phone sync** (owner's phone + shop phone) | Owner can check from home |
| ★★ | **Exchange rate auto-update** when online (still editable) | The CDF rate moves often |
| ★ | **Tax-compliant invoices**: check the DGI requirements (DR Congo's standardised invoice rules) before promising "tax-ready" | Legal requirement for B2B customers |
| ★ | Customer loyalty (points, "10th crate free") | Retention |

---

## 5. Technical foundations (as the team grows)

- Move to **Vite + TypeScript + modules** once there is more than one developer. Keep the bundle small (< 200 KB) for 3G networks.
- Use **Intl.PluralRules** for languages with complex plurals (Lingala and Swahili plurals differ from English).
- Restructure data as a **ledger** (immutable entries plus corrections) to make sync and audit simple.
- **Error reporting** (Sentry or similar, opt-in) and **privacy-respecting analytics** (screens used, tasks completed), so you know what people actually use.
- Set up **CI**: lint, tests and a translation-coverage check (fail the build if a string has no translation).

---

## 6. Business side

- **Pilot:** 5 shops for 4 weeks, free, with weekly visits. Pay attention to what they stop using.
- **Pricing idea:** free for 1 phone (offline). A paid plan (~$3–5/month, paid by Mobile Money) for backup, multi-user, sync and printer support. Shops pay for **less theft** and **peace of mind**, not for software.
- **Distribution:** breweries and distributors (beer depots are their customers), Mobile Money agents, microfinance institutions (they want reliable bookkeeping to give loans). That last one is a strong angle: *"Your records in Ma Caisse help you get a loan."*
- **Support:** a WhatsApp Business number with quick replies in each language.
- **Brand name:** "Ma Caisse" is French. For a multi-language product, consider a neutral name that is easy to say in Lingala, Swahili, French and English.

---

## 7. Suggested timeline

| Weeks | Milestone |
|---|---|
| 1–3 | Cloud backup, owner/cashier roles + audit log, PIN hardening, tests, Play Store build (TWA) |
| 2–5 | Onboarding wizard, simple mode, product photos, Lingala + Swahili, usability test |
| 4 | **Pilot starts** with 5 shops |
| 5–8 | Daily closing, Mobile Money reference, Bluetooth printer, reorder suggestions |
| 8 | Pilot review against the metrics in section 1 → go / adjust / stop |
| 9–10 | Sync between phones, pricing test, distribution partner |
