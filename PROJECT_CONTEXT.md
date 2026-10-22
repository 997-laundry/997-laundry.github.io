# 997 Laundry — Management System (Project Context)

## What it is
Internal laundry management system for **997 Laundry (Al-Riffa, Bahrain)**. Single-file HTML/CSS/JS app, data in browser localStorage (`l997_*` keys). Languages: Arabic (RTL, default) / English / Urdu. Currency BHD (3 decimals), VAT supported. No backend.

## Files
- `laundry-997-full.html` — the complete deliverable (open in a browser; works offline).
- `src/index.html`, `src/styles.css`, `src/finance.js`, `src/app.js` — editable source. `npm run build` merges them into the single file.
- `src/finance.js` — the ONLY place money figures are computed (sales, collected cash, debts, profit, drawer). Every screen calls `L997Finance.summarize()` / `snapshot()`.
- Auth/permission logic and order-flow logic are inside `app.js` (main IIFE + enterprise + inventory/closure IIFEs).

## Modules
Dashboard · POS / New order · Orders · Customers · Balances (customer wallet ledger, statements) · Reports · Finance (expenses, recurring) · Inventory & purchases · Employees & payroll · Daily/monthly closures · Activity audit log · Business profile · Users & permissions · Settings (prices, packages).

## Security / roles
- Roles: owner, manager, accountant, worker. Accounts = employees (username/email/employee no.), salted iterated SHA-256, lockout after 5 tries, idle auto-logout (30 min, 60 s warning), recovery code, must-change-password.
- 19 permissions in a role matrix (Users & Permissions page) + per-employee overrides: create_order, cancel_order, give_discount, allow_credit, edit_customer, balance_tx, balance_adjust, edit_pricing, view_reports, view_closures, approve_closing, add_expense, delete_records, payroll, audit_log, export_data, restore_backup, admin_settings, manage_users.
- **Supervisor override**: if a user lacks a permission, a manager/owner types their own username+password to approve that single action (cannot self-approve; logged).
- Limitation: client-side only — not real server security.

## Order flow (anti-fraud)
1. Live customer search (phone partial / name, Arabic digits OK) → 2. add services → 3. totals (discount capped at 25% with mandatory reason; above needs supervisor) → 4. save + WhatsApp confirmation prompt → 5. "Confirm payment & ready" (full payment; credit/partial needs `allow_credit` or supervisor; balance payment must be sufficient; debt recorded in customer ledger) + WhatsApp "ready" prompt → 6. Delivery: staff must enter actual piece count matching the order; receiver name; WhatsApp thank-you. Cancel needs supervisor, reverses debt/refunds balance. Every step records who did it ("responsibility log" in order dialog); reprints and draft deletions are logged.

## Financial rules (since v1.1)
- Sales = confirmed-paid orders (ready/delivered) dated by `paidAt`, + package sales. Net revenue excludes VAT.
- Collected = cash/card/Benefit/transfer actually received (order payments, deposits, debt payments, packages) − refunds.
- Customer debts = negative customer balances. Profit (estimate) = net revenue − expenses − bonuses/commissions.
- One daily closure per date, one monthly closure per calendar month. Cancelling a paid order records a refund (cash now or to balance).
- Orders can be edited only before payment; reductions need `cancel_order` or supervisor; `order.editHistory` keeps before/after.

## Known limits / next ideas
- Per-browser data; no multi-device sync; no email sending; WhatsApp opens a prefilled message (wa.me), staff presses send.
- Next: backend (Supabase/Firebase) for real auth + sync, WhatsApp Business API automation, branch support.

## How to continue in a Claude Project
Upload `laundry-997-full.html` (or the source files in `src/`) plus this file as project knowledge. When asking for changes, say which page/module; ask Claude to keep: RTL/bilingual UI, permission checks via `can()`, `logActivity()` for sensitive actions, `requireOverride()` for supervisor approvals, and `L997Finance` for any money figure. Run `npm run check` before committing.
