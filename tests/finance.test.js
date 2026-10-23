// Unit tests for src/finance.js — run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/finance.js");

// Fixed local times on one day (process TZ is set to Asia/Bahrain by the npm script)
const at = (day, hh = "10:00") => new Date(`${day}T${hh}:00`).toISOString();
const D1 = "2026-10-20", D2 = "2026-10-21";

function order(o) {
  return {
    id: o.id, number: o.id, customerId: o.customerId || "c1", status: o.status || "ready",
    items: o.items || [{ clothingId: "shirt", serviceId: "washiron", qty: 1, total: o.total }],
    createdAt: o.createdAt || at(D1, "09:00"), readyAt: o.readyAt || null, paidAt: o.paidAt || null,
    debtRecorded: !!o.debt, refund: o.refund,
    payment: { method: o.method || "cash", total: o.total, paid: o.paid ?? o.total, outstanding: o.outstanding || 0, vat: o.vat || 0, discount: o.discount || 0, urgentFee: 0 },
  };
}

test("local day is not shifted to UTC after midnight", () => {
  // 01:30 in Bahrain is still the previous day in UTC — must report the local day
  assert.equal(F.localDay(new Date(`${D2}T01:30:00`)), D2);
});

test("sales are dated by payment confirmation, not order creation", () => {
  const o = order({ id: "a", total: 1, createdAt: at(D1), paidAt: at(D2) });
  assert.equal(F.summarize({ orders: [o] }, D1, D1).salesTotal, 0);
  assert.equal(F.summarize({ orders: [o] }, D2, D2).salesTotal, 1);
  assert.equal(F.summarize({ orders: [o] }, D2, D2).collectedBy.cash, 1);
});

test("unpaid received orders are not sales; cancelled orders are excluded", () => {
  const s = F.summarize({ orders: [
    order({ id: "a", total: 2, status: "received", method: "unpaid", paid: 0 }),
    order({ id: "b", total: 3, status: "cancelled", paidAt: at(D1) }),
  ] }, D1, D1);
  assert.equal(s.salesTotal, 0);
  assert.equal(s.collected, 0);
  assert.equal(s.ordersCreated, 1);
});

test("order paid from customer balance is a sale but not new cash", () => {
  const s = F.summarize({ orders: [order({ id: "a", total: 1.5, method: "balance", paid: 0, paidAt: at(D1) })] }, D1, D1);
  assert.equal(s.salesTotal, 1.5);
  assert.equal(s.paidFromBalance, 1.5);
  assert.equal(s.collected, 0);
});

test("partial payment + later debt settlement: revenue once, cash counted when received", () => {
  const data = {
    orders: [order({ id: "a", total: 0.8, paid: 0.5, outstanding: 0.3, debt: true, paidAt: at(D1) })],
    ledger: [
      { type: "order_charge", amount: -0.3, method: "unpaid", orderId: "a", customerId: "c1", at: at(D1) },
      { type: "credit", amount: 0.3, method: "cash", customerId: "c1", at: at(D2) },
    ],
  };
  const d1 = F.summarize(data, D1, D1), d2 = F.summarize(data, D2, D2);
  assert.equal(d1.salesTotal, 0.8);
  assert.equal(d1.collected, 0.5);
  assert.equal(d1.creditGiven, 0.3);
  assert.equal(d2.salesTotal, 0);
  assert.equal(d2.collected, 0.3);
  assert.equal(d2.expectedCash, 0.3);
});

test("balance deposits are cash in but not revenue", () => {
  const s = F.summarize({ ledger: [{ type: "credit", amount: 10, method: "benefitpay", at: at(D1) }] }, D1, D1);
  assert.equal(s.salesTotal, 0);
  assert.equal(s.collected, 10);
  assert.equal(s.collectedBy.benefitpay, 10);
  assert.equal(s.expectedCash, 0); // not cash in the drawer
});

test("package sale counts as sales and cash, including old records without a stored price", () => {
  const data = {
    customerPackages: [{ customerId: "c1", purchasedAt: at(D1), price: 12 }],
    ledger: [{ type: "package_purchase", amount: 0, method: "cash", customerId: "c1", at: at(D1) }],
  };
  const s = F.summarize(data, D1, D1);
  assert.equal(s.packageSales, 12);
  assert.equal(s.salesTotal, 12);
  assert.equal(s.expectedCash, 12);
});

test("VAT is separated from net revenue; profit uses net revenue", () => {
  const s = F.summarize({
    orders: [order({ id: "a", total: 1.1, vat: 0.1, paidAt: at(D1) })],
    expenses: [{ amount: 0.2, method: "cash", category: "rent", date: at(D1) }],
    payroll: [{ type: "bonus", amount: 0.1, net: 0.1, date: at(D1) }, { type: "advance", amount: 5, net: -5, date: at(D1) }],
  }, D1, D1);
  assert.equal(s.netRevenue, 1);
  assert.equal(s.profit, 0.7); // 1.000 − 0.200 expenses − 0.100 bonus; the advance is not a cost
  assert.equal(s.advances, 5);
  assert.equal(s.expectedCash, 0.9);
});

test("cash refund on cancellation reduces collected cash on the refund day", () => {
  const o = order({ id: "a", total: 2, status: "cancelled", paidAt: at(D1), refund: { mode: "cash", method: "cash", amount: 2, at: at(D2) } });
  assert.equal(F.summarize({ orders: [o] }, D1, D1).collected, 2);
  assert.equal(F.summarize({ orders: [o] }, D2, D2).collected, -2);
  assert.equal(F.summarize({ orders: [o] }, D1, D2).collected, 0);
  assert.equal(F.summarize({ orders: [o] }, D1, D2).salesTotal, 0);
});

test("snapshot receivables come from customer balances", () => {
  const s = F.snapshot({ customers: [{ balance: -0.3 }, { balance: 2 }, { balance: 0 }], orders: [order({ id: "a", total: 4, status: "received" })] });
  assert.equal(s.receivables, 0.3);
  assert.equal(s.prepaid, 2);
  assert.equal(s.openValue, 4);
});

test("debt allocation: oldest credit order is settled first", () => {
  const orders = [
    order({ id: "old", total: 1, paid: 0, outstanding: 1, debt: true, paidAt: at(D1) }),
    order({ id: "new", total: 2, paid: 0, outstanding: 2, debt: true, paidAt: at(D2) }),
  ];
  assert.deepEqual(F.allocateDebts([{ id: "c1", balance: -2.5 }], orders), { new: 2, old: 0.5 });
  assert.deepEqual(F.allocateDebts([{ id: "c1", balance: 0 }], orders), { new: 0, old: 0 });
});

test("rounding stays at 3 decimals (BHD fils)", () => {
  const orders = Array.from({ length: 10 }, (_, i) => order({ id: "o" + i, total: 0.1, paidAt: at(D1) }));
  assert.equal(F.summarize({ orders }, D1, D1).salesTotal, 1);
});

test("month bounds and day arithmetic", () => {
  assert.deepEqual(F.monthBounds("2026-02-14"), { from: "2026-02-01", to: "2026-02-28", key: "2026-02" });
  assert.equal(F.addDays("2026-03-01", -1), "2026-02-28");
});

test("pay later: ready-but-unpaid order is not a sale until paid at pickup", () => {
  const o = order({ id: "a", total: 1, method: "unpaid", paid: 0, readyAt: at(D1) });
  o.paymentConfirmed = false; o.payLater = true;
  const s1 = F.summarize({ orders: [o] }, D1, D2);
  assert.equal(s1.salesTotal, 0);
  assert.equal(s1.collected, 0);
  assert.equal(F.snapshot({ orders: [o] }).openValue, 1);
  // paid in cash on pickup the next day → sale + cash dated D2
  Object.assign(o, { paymentConfirmed: true, paidAt: at(D2), status: "delivered" });
  Object.assign(o.payment, { method: "cash", paid: 1 });
  assert.equal(F.summarize({ orders: [o] }, D1, D1).salesTotal, 0);
  assert.equal(F.summarize({ orders: [o] }, D2, D2).salesTotal, 1);
  assert.equal(F.summarize({ orders: [o] }, D2, D2).expectedCash, 1);
  assert.equal(F.snapshot({ orders: [o] }).openValue, 0);
});
