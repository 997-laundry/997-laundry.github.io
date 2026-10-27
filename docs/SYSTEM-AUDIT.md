# 997 Laundry — System Audit & Readiness (2026-10-24)

Scope: the code in this repository, the live site https://997-laundry.github.io, and the live Supabase project
`szlfvwzuyllitqkdysju` (Tokyo). Everything marked **verified** was executed in this session; results below are the
observed outputs, not expectations.

## 1. What the application actually is

| Layer | Implementation (verified in code) |
|---|---|
| Frontend | One static page (`src/index.html`, `src/app.js` ~6.3k lines, `src/finance.js`, `src/cloud.js`, `src/translate.js`), built into `index.html` by `tools/build.js`. No framework, no external runtime libraries. |
| Hosting | GitHub Pages: `997-laundry/997-laundry.github.io` (new) and `jassimal3akbry/Laundry-997` (old address, shows a "moved" banner). Single page — no client routes, so no deep-link/base-path issues. |
| Device storage | Each device keeps a full working copy in `localStorage` (keys `l997_*`) so the shop keeps working offline. |
| Cloud | Supabase (PostgreSQL + Auth). One `records` table (collection + id + JSON + version + change counter), `shop_members` (roles), `record_history` (every insert/update), RLS on every table. Setup: `supabase/setup.sql`. |
| Sync | `src/cloud.js`: pushes each changed record (version-checked update), pulls other devices' changes by change counter every 10 s, applies them only when the device is idle, then refreshes the page. |
| Auth | Supabase Auth account per staff member (`username@997laundry.app`, no e-mails sent) + local password cache for offline sign-in. Password hashes never leave the device. |

**Important architectural truth.** The cloud is the shared copy and wins every conflict, but each screen reads and
writes the device copy first. A saved order is therefore *saved on the device* immediately and *in the cloud* a few
seconds later (or when the internet returns). The green "☁ Synced ✓" / orange "☁ offline — will upload later"
indicator is the only proof of cloud commit. Financial operations are not server-side transactions (see risks).

## 2. Feature inventory

| Module | Status | Evidence |
|---|---|---|
| Orders: create / edit before payment / cancel / pay later / ready / deliver with piece count | Implemented & verified | e2e.smoke, e2e.services, e2e.sweep |
| Services wash / iron / wash+iron / dry clean; add-ons perfume / wrapping; urgent fee (garments only); discount with cap + reason | Implemented & verified | e2e.services (totals 3.400 → 1.750 after edit) |
| Customers, balances ledger, debts, deposits, refunds, statements | Implemented & verified | e2e.smoke, e2e.ops |
| Customer balance = ledger sum (multi-device safe) | **Fixed this session** & verified | e2e.cloud "both offline payments" (old code: 1.250, fixed: 2.000) |
| Packages (sale, coverage by garment, consumption, cancel returns pieces) | Implemented & verified locally; remaining pieces now derived from orders | e2e.smoke, finance.test package test |
| Expenses (categories, recurring, void with reason) | Implemented & verified | e2e.month, e2e.ops |
| Inventory & purchases (average cost, void guard, stock count) | Implemented & verified | e2e.ops |
| Staff, payroll run (once per month), attendance from shifts | Implemented & verified | e2e.people, e2e.month |
| Shifts & cash custody, daily / monthly closures (one per period) | Implemented & verified (single device) | e2e.shifts, e2e.month |
| Reports / dashboard (sales ≠ collected ≠ receivables ≠ estimated profit) | Implemented & verified | finance.test (26), e2e.smoke |
| Roles + 19 permissions + supervisor approval | Implemented & verified in app; server enforces per-role collections only | e2e.roles, security_test.sql |
| Cloud: link, staff accounts, join device, sync, offline queue, conflicts, unique order numbers | Implemented & verified on local stand-in (real PostgreSQL + real rules); sync confirmed by owner on real devices | e2e.cloud (45), owner test |
| Receipts: print 80 mm, WhatsApp text, **PDF / image via share sheet** | Implemented & verified (file validity with pdfinfo) | e2e.services |
| WhatsApp | Opens a pre-filled chat; staff press Send. **No automatic sending** (no WhatsApp Business API). | by design |
| Backups | Manual export file per device + cloud copy + `record_history`. **No automatic cloud backup on the free Supabase plan.** | — |
| Restore into cloud from a backup file | Missing (blocked while linked to avoid overwriting cloud data) | — |

## 3. Test evidence (this session, all executed)

| Suite | Result |
|---|---|
| `npm test` (finance engine + fils precision) | 26 / 26 pass |
| `npm run e2e` (10 browser suites, Arabic/English, desktop/phone, 299-button sweep) | 139 checks, 0 failures |
| `npm run test:cloud` (RLS / permissions + server-side business rules on PostgreSQL 16, role by role, attacker cases) | 80 / 80 pass |
| `npm run e2e:cloud` (3 devices, 150 ms latency, offline + reload, conflicts, numbering, joins, worker payment / delivery / approved cancellation under server rules) | 47 / 47 pass, 5 consecutive runs |
| Live Supabase probes | anonymous: denied on every table/function; stranger account: sees nothing, cannot create a shop |
| Secret scan of the whole Git history | no secret/service key; only the public publishable key |

## 4. Accounting invariants (automated)

1. Sales are dated by payment confirmation; collected cash = cash/card/Benefit/transfer received − refunds (finance.test).
2. Amounts are rounded to the fils (`r3`, half-up, symmetric); 1,000 × 0.001 = 1.000; 3,000 × 3.375 = 10,125 exactly.
3. Customer balance = Σ ledger entries + approved opening balance, on every device and in the cloud (e2e.cloud).
4. Package remaining = total − pieces used by non-cancelled orders, never negative (finance.test).
5. One daily closure per day, one monthly closure per month, payroll once per employee per month (e2e.month).
6. Order numbers unique across devices when online (e2e.cloud, simultaneous saves).
7. Records cannot be deleted through the API; audit entries cannot be edited; every change is in `record_history` (security_test).

## 5. Top risks (ranked)

| # | Risk | Severity | Status |
|---|---|---|---|
| 1 | Customer balance lost one of two concurrent payments (stored number vs ledger) | Critical | **Fixed** — derived from ledger; legacy differences shown for owner review |
| 2 | Server rules were per role and collection only: a worker with technical skill could alter ledger amounts or mark an order paid through the API | High | **Mitigated** — `business_rules()` in the database now refuses, for non-managers: editing ledger amounts/types, editing or reopening paid/cancelled/delivered orders, invalid status jumps, new orders created as paid, changing expense amounts, restoring voided expenses, changing package size/price or opening balances; closures/payroll editable by owner only (16 attacker tests) |
| 3 | Multi-record financial operations (order + ledger + customer) upload as separate records, not one transaction | High | Partially mitigated (derived balances); full fix with the RPCs above |
| 4 | No automatic cloud backup on the free plan | High | **Open** — weekly export file required; Supabase Pro (~25 USD/month) adds daily backups |
| 5 | Two devices consuming the last package pieces while offline can over-redeem | Medium | Detected (shown as 0 / used > total); prevention needs the server RPC |
| 6 | Data stays readable on a device after sign-out (browser storage) | Medium | Open — keep shop devices locked; a "wipe this device" button is planned |
| 7 | Closed days can still be affected by later corrections (no period lock) | Medium | Open — planned "closed period" lock with authorised adjustment |
| 8 | Day boundaries use the device clock/time zone | Medium | Open — set all shop devices to Bahrain time automatically |
| 9 | Old Supabase project (`997 Laundry System`, Singapore) still exists with an earlier schema | Low | Owner to delete after confirming it holds nothing needed |
| 10 | Two tabs of the app on one device can produce harmless conflict notes | Low | Open — use one tab per device |

## 6. Plan (next sessions, in order)

1. **Server-side financial operations** (`record_payment`, `refund`, `cancel_order`, `redeem_package` as PostgreSQL functions, one transaction each, with an idempotency key so a retry never double-posts), and RLS that stops direct writes to ledger/payments by workers.
2. **Closed-period lock** + authorised adjustment entries; daily closing shows unsynced items before allowing approval.
3. **Backups**: one-click cloud export (all records) for the owner + documented restore into a test project.
4. Device wipe on sign-out (optional per device), Bahrain time zone enforcement.
5. Delete the old Supabase project; retire the old address.

## 7. Readiness

| Area | Classification |
|---|---|
| Daily operation on one main device | PASS |
| Multi-device sync (orders, statuses, customers, balances, packages) | PASS WITH LIMITATIONS (see risks 2, 3, 5) |
| Security against outsiders / anonymous access | PASS (verified live) |
| Security against a technically skilled employee | PASS WITH LIMITATIONS (financial edits now blocked by the server; a fabricated new payment entry is still possible but recorded with who/when) |
| Financial calculations & precision | PASS (automated invariants) |
| Backup & disaster recovery | PASS WITH LIMITATIONS (manual export + cloud copy; restore-to-cloud not built; no restoration drill in a separate project yet) |
| WhatsApp automatic sending | NOT IMPLEMENTED (by design; manual Send) |
| Real-phone share sheet for PDF receipts | NOT TESTED here (owner to confirm on iPhone) |

## 8. Session 4 changes (server-side integrity)

| Change | Evidence |
|---|---|
| `business_rules()` + `jdiff()` enforced by the `records_guard` trigger on every insert/update | security_test.sql 80/80 |
| Supervisor approval works on staff devices: the supervisor's password is checked against the cloud (no password hash is ever downloaded); the session is discarded immediately | e2e.cloud "worker's approved cancellation accepted" |
| **Bug fixed:** changes made offline were forgotten if the page reloaded before the internet returned (never uploaded) | reproduced without fix (cloud 1 / device 2), passes with fix |
| **Bug fixed:** right after linking, the upload lock was released after the first sync started, allowing two overlapping uploads (false conflicts) | 5 consecutive clean runs |

## 9. Order lifecycle & customer financial audit (2026-10-26)

**How money is stored (verified in code):** an order is saved unpaid (`status: received`). Payment is confirmed once, when
the order is marked ready or delivered (`payment.paid`, `paidAt`, `paymentBy`). Any unpaid part becomes a debt entry in the
customer ledger (`order_charge`, negative). Later payments are ledger `credit` entries; when made from an order they carry
`orderId` + `settles: true`. Customer balance = opening balance + Σ ledger (recomputed on every save). Remaining per order =
order debt − payments allocated to that order, then unallocated payments settle the oldest debt first. The sum of order
remainders always equals the customer's debt.

| Area | Result | Evidence |
|---|---|---|
| Customers: new, search by name / phone, similar names, duplicate phone refused, created from order screen | PASS | e2e.lifecycle |
| Orders: thobe, shirts, trousers, ghatra, abaya, suit, blanket; remove/adjust lines; urgent fee; totals = Σ qty × price | PASS | e2e.lifecycle |
| Stored total = screen total = receipt total | PASS | e2e.lifecycle |
| Empty order / no customer / double-click save / negative quantity on edit | PASS (refused; one order) | e2e.lifecycle |
| Lifecycle received → ready → delivered; who/when; wrong piece count; deliver twice; refresh; sign-out | PASS | e2e.lifecycle |
| A full / B partial / C unpaid & pay on pickup & credit / D later payments / E overpayment / F cancellations | PASS | e2e.lifecycle |
| Arrears 10/10, 8/3, 6/0, 4/2 = 13.000 → 5.000 on order 2 → 8.000; unallocated 1.000 → 7.000 | PASS | e2e.lifecycle, finance.test |
| Customer file: summary, counts by stage, items per order, payments history with method and employee | PASS | e2e.lifecycle |
| Packages: active, last piece, exhausted, cancellation returns pieces | PASS | e2e.lifecycle |
| Two devices: order / payment / status visible live on the other device's open screens | PASS | e2e.syncfin |
| Same order paid on two devices at once (both orders of arrival) | PASS after fix | e2e.syncfin (without fix: −16.000 instead of −9.000) |
| Saved on server, reply lost, retried → one entry, no false conflict | PASS after fix | e2e.syncfin |
| Payment on one device never counted in another employee's shift | PASS | e2e.syncfin |
| Server refuses a second payment/refund entry for the same order | PASS | security_test.sql (86/86) |

**Bugs found and fixed:** order screen and printed receipt showed the remaining amount frozen at the first payment;
no way to apply a payment to a specific order; two devices paying the same order could post a debt that contradicts the
winning payment; a retry after a lost reply was logged as a conflict; staff devices showed "syncing…" forever for data
they are not allowed to upload.

## 10. Previously untested items — closed (2026-10-27)

| Item | Result | Evidence |
|---|---|---|
| Upgrading the live database: old setup.sql + 1,201 records → new setup.sql (twice) | PASS — records, history, staff, counters byte-identical; normal work accepted; only duplicates refused; old data untouched | upgrade drill (PostgreSQL 16) |
| Device set to another time zone (India, UTC, New York, UTC+14, UTC−11) | **Bug fixed** — a sale at 23:30 Bahrain was filed under the next day and shown as 02:00; business day and times are now always Bahrain's | e2e.risks, finance.test in 6 zones |
| Device clock wrong | **New** — offset measured against the server; red warning at ≥ 5 minutes | e2e.risks (42 min detected) |
| Customer without phone / invalid phone | PASS (refused) | e2e.risks |
| Price changed after an order; editing that order; negative price | PASS (order keeps its price; new orders use the new one; negative never saved) | e2e.risks |
| Same manual payment recorded twice | **New guard** — identical amount for the same customer within 10 minutes needs a second press | e2e.risks, e2e.lifecycle |
| Phone-size touch screen (iPhone 13 size, Chromium engine) | PASS (order, payment, customer file, no sideways scroll) | e2e.risks |
| Automatic full refresh while offline showed the browser's "no internet" page | **Bug fixed** — never auto-refresh without a connection | e2e.syncfin ×8 |
| Real Safari / iPhone | BLOCKED — no WebKit engine in this environment | owner to check on device |

## 11. Order numbers in sequence (2026-10-27)

Cause: each device reserved a block of 10 numbers (A 1–10, B 11–20 …), so numbers interleaved (11, 12, 1, 2) and unused
blocks left gaps. Now one number is reserved from the cloud at the moment of saving (strict sequence across devices;
offline falls back to local numbering with the duplicate warning). Owner tool "🔢 ترتيب أرقام الطلبات" renumbers all
orders 1…N by creation date, keeps `prevNumber` (searchable, shown on the order), logs it, and resets the cloud counter
(`set_order_counter`, owner only, never below an existing number). Evidence: e2e.syncfin §7 (old build: 11,12,1,2;
new: 1,2,3,4), security_test (91).
