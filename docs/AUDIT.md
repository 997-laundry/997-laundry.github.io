# 997 Laundry — Audit & Work Log

## Session 1 (2026-10-23)

### What the project is
A mature single-file web app (~4,800 lines JS) with orders/POS, customers, wallet balances,
packages, reports, finance, inventory & purchases, employees & payroll, daily/monthly closures,
audit log, 4 roles + 19 permissions + supervisor override, 3 languages. Data lives in the
browser's localStorage. No backend, no Supabase, no hosting, no external services
(WhatsApp opens a pre-filled wa.me message; staff press send).

### Findings (verified by running the app in a browser)

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Critical | Reports counted only cash paid, grouped by **order creation** date → wrong daily sales and wrong daily cash drawer | Fixed — unified engine `src/finance.js` |
| 2 | Critical | Dates used UTC → between 00:00–03:00 Bahrain time, today's orders disappeared from reports/closures | Fixed — local dates everywhere |
| 3 | Critical | Package sales recorded **no money** anywhere (not in sales, not in cash) | Fixed — price stored; old records recovered automatically |
| 4 | High | Orders paid from customer balance counted as 0 sales | Fixed |
| 5 | High | Debt repayments never reduced "outstanding"; delivered orders with debt were excluded from it | Fixed — debts now come from customer balances; order shows "still owed now" |
| 6 | High | "Net profit" = cash received − expenses (mixed cash and accrual); salary advances *increased* profit | Fixed — estimated profit on net revenue; advances are not costs |
| 7 | High | Cancelling a paid order left the cash unaccounted ("refund manually") | Fixed — choose refund now (deducted from drawer) or add to customer balance |
| 8 | High | Daily/monthly closure could be approved repeatedly for the same period; "month" was a rolling 31 days | Fixed — one closure per day/month, calendar months, approver recorded |
| 9 | Medium | Language choice reverted to Arabic on reload and threw a JavaScript error | Fixed |
| 10 | Medium | Orders could not be edited after saving | Added — edit before payment, totals recalculated, reductions need supervisor, full edit history |
| 11 | Medium | Finance page: users with view-only report access could add expenses / delete recurring expenses; anyone could sell packages | Fixed — permission checks + supervisor override + audit log |
| 12 | Low | No low-stock alerts or "ready > 3 days" follow-ups on dashboard | Added |
| 13 | Low | Reports date bar overflowed on phones | Fixed |
| 14 | Structural | All security is client-side; data is per-browser (no multi-device, lost if browser data is cleared) | **Open — needs a backend (see roadmap)** |

### Decisions
- **Kept the existing architecture.** It works offline, costs nothing, and is feature-rich. Rebuilding would add risk without business benefit at this stage.
- **One finance engine** (`src/finance.js`) used by dashboard, reports, finance and closures, so numbers always agree. Pure functions with unit tests.
- Added a reproducible build (`tools/build.js` reproduces the original file byte-for-byte), lint, unit tests and a browser test.

### Roadmap (next sessions, in priority order)
1. **Cloud backend (Supabase, free tier)** — real login, data shared across devices, automatic backup, server-side permissions (Row Level Security). Needs the owner to create a free Supabase account (instructions will be provided; no secrets in chat).
2. Worker-role browser tests (verify a worker cannot see financial figures or approve credit).
3. Printable/shareable receipt as image/PDF for WhatsApp; Arabic/English receipt polish.
4. Expense categories as a fixed list (consistent reports), salary payment flow.
5. WhatsApp Business API (paid per message) — only after 1–3 are stable.
6. AI helpers (daily summary, debt follow-up drafts) — only after data is reliable.

## Session 2 (2026-10-23)

### Audit of current state
- Repository = the uploaded zip (identical); the uploaded `laundry-997-full.html` is an older build (before the offline-app commit). No uncommitted work.
- Stack unchanged: single-file offline web app, data in browser storage, no backend / Supabase / paid services.
- Baseline: lint clean, 22 unit tests pass, all 9 browser suites pass — but suites failed at random (~1 run in 7).
  Root cause found by catching it in the act: the tests opened the app as a local file (file://), and headless Chromium
  can drop a file page's storage on reload, so the app came back as a "first-time setup". Served over http (how the
  real site is opened) the same suite passed 16/16. All suites now use a tiny local web server (`tests/serve.js`).

### Gaps found against the business requirements → fixed this session
| # | Gap | Fix |
|---|---|---|
| 1 | No **dry-cleaning** service | Added as a 4th service column in Settings → Prices. Shown for a garment only once it has a price (no invented prices; existing prices untouched). |
| 2 | No **fragrance / packaging** add-ons | Order add-ons with a price and "per order / per piece" in Settings → Prices. Toggles appear in the cart only when priced. Urgent fee applies to garments only. Add-ons are stored on the order, shown in the order, printed receipt and WhatsApp receipt, follow piece-count changes on edit, and are not counted as pieces at delivery. |
| 3 | WhatsApp messages were not **itemized receipts** | New "🧾 Receipt on WhatsApp" button in every order: shop name, order no., date, customer, each item × qty = price, add-ons, subtotal, urgent fee, discount, VAT, total, payment method, paid, balance due / fully paid, package usage. Opens WhatsApp with the text; staff press Send (no automatic sending is claimed). |
| 4 | New installs came with **invented stock** (12 kg detergent, 180 bags, 8 L perfume with costs) and a placeholder supplier — inflated inventory value | New installs start with an empty material and supplier list. Existing data is not touched. |
| 5 | Browser could silently **evict stored data** (notably iPhone Safari after inactivity) | App now requests persistent storage from the browser. Weekly backup remains essential. |
| 6 | If browser storage is blocked (in-app browser of WhatsApp/Instagram, private mode) the app silently ran on temporary memory and looked like a brand-new install — risk of panic, re-setup, or restoring an old backup over good data | Clear red warning on the login/setup screen and inside the app: nothing will be saved, open the link directly in Safari/Chrome. |

### Tests
- New `tests/e2e.services.js` (20 checks): dry-clean pricing, add-on totals (incl. urgent rule), edit recalculation, delivery piece count, dashboard sales, Arabic + English WhatsApp receipt, empty starting inventory, blocked-storage warning.
- `tests/e2e.ops.js` now creates its own known starting stock instead of relying on the old invented defaults.

### Still open (priority order)
1. **Cloud database (Supabase free tier)** — the biggest remaining risk: data lives on one device, security is browser-side only. Needs the owner to create a free account (no secrets in chat). Plan: real staff logins, shared data across devices, automatic backup, server-side permissions (Row Level Security).
2. Receipt as an image/PDF attachment (WhatsApp links can only carry text).
3. WhatsApp Business API (paid per message) — only after 1 is stable.
4. AI helpers (daily summary, debt follow-ups) — only after data is reliable and shared.
