# 997 Laundry — Management System

Offline, single-file laundry management system for **997 Laundry (Al-Riffa, Bahrain)**.
Arabic (default, RTL) / English / Urdu · BHD with 3 decimals · optional VAT.

## For the owner — how to use it

Open **`laundry-997-full.html`** in Chrome or Edge (double-click it). Nothing to install.
Data is saved inside that browser on that device — **export a backup weekly** from
*ملف المنشأة → تصدير نسخة احتياطية*.

## Project layout

| Path | What it is |
|---|---|
| `laundry-997-full.html` | The finished app (generated — do not edit by hand) |
| `src/index.html`, `src/styles.css` | Page structure and design |
| `src/finance.js` | **Single source of truth for all money figures** (sales, cash collected, debts, profit, cash drawer) |
| `src/app.js` | Everything else: orders, customers, balances, inventory, staff, permissions, audit |
| `src/cloud.js` | Optional cloud sync with Supabase (inactive until the owner links the system) |
| `supabase/setup.sql` | Cloud database: tables, server-side role rules (RLS), change history. Run once in Supabase SQL Editor (safe to re-run) |
| `supabase/reset_test_data.sql` | Wipes all cloud data + accounts (after testing only) |
| `tests/supabase-standin.js` | Local stand-in for Supabase on a real PostgreSQL, used by `tests/e2e.cloud.js` |
| `tools/build.js` | Merges `src/` into `laundry-997-full.html` |
| `tests/finance.test.js` | Unit tests for every money rule |
| `tests/e2e.smoke.js` | Drives the real app in a headless browser (order → payment → debt → refund → closure) |
| `tests/e2e.*.js` | Further browser suites: roles, operations, people, month-end, shifts, English, sweep, offline, services (dry clean, add-ons, WhatsApp receipt) |
| `docs/AUDIT.md` | Audit report, decisions, and roadmap |

## Developer commands

```bash
npm run build   # regenerate laundry-997-full.html from src/
npm test        # finance unit tests (Bahrain time zone)
npm run lint    # catches undefined names / duplicate keys
npm run e2e     # build + full browser test
npm run check   # all of the above
npm run check:cloud  # cloud: 59 database security checks + two-device sync test (needs local PostgreSQL)
```

## Financial definitions (used on every screen)

| Term | Meaning |
|---|---|
| **Sales / المبيعات** | Value of orders whose payment was confirmed (ready/delivered), dated by **payment date**, plus package sales. Includes VAT. |
| **Net revenue / الإيراد الصافي** | Sales minus VAT. |
| **Cash collected / المحصّل فعلياً** | Money actually received (cash, card, Benefit Pay, bank transfer): order payments, balance deposits, debt repayments, package sales — minus refunds. |
| **Customer debts / ديون العملاء** | Sum of negative customer balances right now. |
| **Estimated profit / الربح التقديري** | Net revenue − recorded expenses − staff bonuses/commissions. Salaries count once recorded as an expense. |
| **Expected drawer cash / الصندوق المتوقع** | Cash-only receipts − cash refunds − cash expenses for the day. |
