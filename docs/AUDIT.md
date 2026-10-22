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
