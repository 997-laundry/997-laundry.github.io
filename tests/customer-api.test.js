// Unit tests for supabase/functions/customer-api (the customer app's server), with Supabase REST mocked.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "customer-api", "index.ts"), "utf8");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "capi-")), "index.mjs");
fs.writeFileSync(tmp, src);
const load = () => import(tmp).then((m) => m.handle);
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc" };
const SHOP = "shop-1";

function world() {
  const settings = { prices: { thob_cotton_washiron: 0.5, thob_cotton_iron: 0.2, shirt_washiron: 0.4 }, garmentActive: { agal: false }, serviceActive: {},
    packageDefs: [{ id: "p50", name: "غسيل وكوي 50 قطعة", serviceType: "washiron", pieceCount: 50, price: 16.9, validDays: 60, dlvTrips: 4, dlvPeriod: "total", bonus: "", garments: [] },
      { id: "bs", name: "B-spc", serviceType: "iron", pieceCount: 150, price: 30, garments: [], private: true }],
    delivery: { on: true, fee: 0.5, pkgFree: 4, pkgFee: 0.5, freeOver: 0 }, urgentHours: 6, normalHours: 24 };
  const recs = [
    { collection: "settings", record_id: "_", data: settings },
    { collection: "profile", record_id: "_", data: { nameAr: "مغسلة 997", phone: "39599902" } },
    { collection: "customers", record_id: "c1", data: { id: "c1", name: "Ali", phone: "97333111111", balance: -1.2, area: "الرفاع", address: "مجمع 901" } },
    { collection: "customers", record_id: "c2", data: { id: "c2", name: "Other", phone: "97333222222", balance: 0 } },
    { collection: "orders", record_id: "o1", data: { id: "o1", number: "00007", customerId: "c1", status: "ready", items: [{ clothingId: "thob_cotton", serviceId: "washiron", qty: 3, total: 1.5 }, { clothingId: "shirt", serviceId: "washiron", qty: 2, total: 0, unit: 0, listUnit: 0.4, fromPackageId: "cp1" }], payment: { total: 1.5, paid: 0.5, subtotal: 1.5 }, paymentConfirmed: true, createdAt: "2026-11-01T10:00:00Z", statusHistory: [{ status: "received", at: "2026-11-01T10:00:00Z" }, { status: "ready", at: "2026-11-02T10:00:00Z" }], receiptPub: { token: "TOK" } } },
    { collection: "orders", record_id: "o2", data: { id: "o2", number: "00008", customerId: "c2", status: "received", items: [{ clothingId: "thob_cotton", serviceId: "washiron", qty: 9, total: 4.5 }], payment: { total: 4.5, paid: 0 }, createdAt: "2026-11-02T10:00:00Z" } },
    { collection: "customer_packages", record_id: "cp1", data: { id: "cp1", customerId: "c1", name: "باقة 50", serviceType: "washiron", totalPieces: 50, remainingPieces: 48, expiresAt: "2099-01-01", dlvTrips: 4, dlvPeriod: "total" } },
  ].map((r) => ({ shop_id: SHOP, deleted: false, ...r }));
  const msgs = [], threads = [];
  const q = (url) => { const u = new URL(url); const o = {}; u.searchParams.forEach((v, k) => { o[k] = v; }); return { table: u.pathname.split("/rest/v1/")[1], o }; };
  const match = (row, o) => Object.entries(o).every(([k, v]) => {
    if (["select", "limit", "order"].includes(k)) return true;
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    const cur = k.startsWith("data->>") ? (row.data || {})[k.slice(7)] : row[k];
    if (op === "eq") return String(cur) === val;
    if (op === "gte") return String(cur) >= val;
    if (op === "ilike") return new RegExp(val.replace(/\*/g, ".*"), "i").test(String(cur));
    return true;
  });
  const res = (body, status = 200) => new Response(body === undefined ? "" : JSON.stringify(body), { status });
  const f = async (url, opt = {}) => {
    const { table, o } = q(url);
    if (table === "shops") return res([{ id: SHOP }]);
    const store = table === "records" ? recs : table === "wa_messages" ? msgs : table === "wa_threads" ? threads : null;
    if (!store) return res({}, 404);
    if ((opt.method || "GET") === "GET") return res(store.filter((r) => match(r, o)).slice(0, Number(o.limit) || 1000));
    const b = JSON.parse(opt.body); store.push({ deleted: false, at: new Date().toISOString(), ...b }); return res(undefined, 201);
  };
  return { f, recs, msgs, threads };
}
const call = (handle, w, body) => handle(new Request("https://x/functions/v1/customer-api", { method: "POST", body: JSON.stringify(body) }), ENV, { fetch: w.f }).then(async (r) => ({ status: r.status, body: await r.json() }));
async function signIn(handle, w, phone) {
  const s = await call(handle, w, { action: "login_start" });
  w.msgs.push({ shop_id: SHOP, phone, dir: "in", body: s.body.text, at: new Date().toISOString() });
  return (await call(handle, w, { action: "login_check", code: s.body.code, nonce: s.body.nonce })).body;
}

test("catalog: public prices and packages — private packages and hidden items are never shown", async () => {
  const handle = await load(), w = world();
  const r = await call(handle, w, { action: "catalog" });
  assert.equal(r.status, 200);
  const thobe = r.body.items.find((x) => x.id === "thob_cotton");
  assert.deepEqual(thobe.prices, { washiron: 0.5, iron: 0.2 }); assert.equal(thobe.ar, "ثوب");
  assert.ok(!r.body.items.some((x) => x.id === "agal"), "switched-off item hidden");
  assert.deepEqual(r.body.packages.map((p) => p.name), ["غسيل وكوي 50 قطعة"]);
  assert.equal(r.body.packages[0].perPiece, 0.338);
  assert.equal(r.body.shop.phone, "97339599902");
});

test("sign-in: code → customer sends it on WhatsApp → session for THAT phone's customer only", async () => {
  const handle = await load(), w = world();
  const s = await call(handle, w, { action: "login_start" });
  assert.match(s.body.code, /^997-\d{6}$/); assert.match(s.body.link, /^https:\/\/wa\.me\/97339599902\?text=/);
  assert.deepEqual((await call(handle, w, { action: "login_check", code: s.body.code, nonce: s.body.nonce })).body, { ok: false, waiting: true });
  w.msgs.push({ shop_id: SHOP, phone: "97333111111", dir: "in", body: s.body.text, at: new Date().toISOString() });
  const ok = (await call(handle, w, { action: "login_check", code: s.body.code, nonce: s.body.nonce })).body;
  assert.equal(ok.ok, true); assert.equal(ok.customer.id, "c1"); assert.ok(ok.token.length > 40);
  const forged = await call(handle, w, { action: "login_check", code: "997-000000", nonce: s.body.nonce });
  assert.equal(forged.status, 400, "a code not issued by the server is refused");
});

test("a new phone gets a customer file automatically", async () => {
  const handle = await load(), w = world();
  const r = await signIn(handle, w, "97336666666");
  assert.equal(r.ok, true);
  const c = w.recs.find((x) => x.collection === "customers" && x.data.phone === "97336666666");
  assert.ok(c && c.data.source === "app");
});

test("home: only my orders, my package, my debt; receipts linked; other customers invisible", async () => {
  const handle = await load(), w = world();
  const { token } = await signIn(handle, w, "97333111111");
  const r = (await call(handle, w, { action: "home", token })).body;
  assert.equal(r.customer.name, "Ali"); assert.equal(r.debt, 1.2);
  assert.deepEqual(r.active.map((o) => o.number), ["00007"]);
  assert.equal(r.active[0].owed, 1); assert.equal(r.active[0].receipt, "https://997-laundry.github.io/r.html?t=TOK");
  assert.equal(r.packages[0].left, 48);
  const other = await call(handle, w, { action: "order", token, id: "o2" });
  assert.equal(other.status, 404, "another customer's order is not readable");
  const mine = (await call(handle, w, { action: "order", token, id: "o1" })).body.order;
  assert.equal(mine.items.length, 2); assert.equal(mine.items[1].fromPackage, true); assert.equal(mine.items[1].value, 0.8); assert.equal(mine.packageValue, 0.8);
  assert.equal((await call(handle, w, { action: "home", token: "x.y" })).status, 401);
  assert.equal((await call(handle, w, { action: "home" })).status, 401);
});

test("pickup booking: lands on the delivery page (needs staff confirmation) — never twice", async () => {
  const handle = await load(), w = world();
  const { token } = await signIn(handle, w, "97333111111");
  const r = (await call(handle, w, { action: "book_pickup", token, area: "الرفاع", address: "مجمع 901 طريق 1", slot: "evening", drop: true, notes: "ثياب", location: "26.13,50.55" })).body;
  assert.equal(r.ok, true);
  const req = w.recs.find((x) => x.collection === "suspended_orders").data;
  assert.equal(req.kind, "pickup"); assert.equal(req.source, "app"); assert.equal(req.needsConfirm, true); assert.equal(req.customerId, "c1");
  assert.match(req.address, /maps\.google\.com\/\?q=26\.13,50\.55/);
  const again = (await call(handle, w, { action: "book_pickup", token, address: "x", slot: "morning" })).body;
  assert.equal(again.already, true);
  assert.equal(w.recs.filter((x) => x.collection === "suspended_orders").length, 1);
});

test("delivery request for my ready order (not someone else's), once only", async () => {
  const handle = await load(), w = world();
  const { token } = await signIn(handle, w, "97333111111");
  assert.equal((await call(handle, w, { action: "request_delivery", token, orderId: "o2", address: "x" })).status, 404);
  assert.equal((await call(handle, w, { action: "request_delivery", token, orderId: "o1", slot: "night" })).body.ok, true);
  assert.equal((await call(handle, w, { action: "request_delivery", token, orderId: "o1", slot: "night" })).body.already, true);
  const reqs = w.recs.filter((x) => x.collection === "suspended_orders");
  assert.equal(reqs.length, 1); assert.equal(reqs[0].data.kind, "dropreq"); assert.equal(reqs[0].data.orderNumber, "00007"); assert.equal(reqs[0].data.address, "الرفاع — مجمع 901");
});

test("rating goes to the staff inbox on the customer's chat; low ratings are flagged", async () => {
  const handle = await load(), w = world();
  const { token } = await signIn(handle, w, "97333111111");
  assert.equal((await call(handle, w, { action: "feedback", token, orderId: "o1", rating: 2, message: "تأخر" })).body.ok, true);
  const note = w.msgs.find((m) => m.dir === "note");
  assert.match(note.body, /تقييم منخفض/); assert.match(note.body, /#00007/); assert.match(note.body, /تأخر/);
  assert.equal(w.threads[0].flag, "complaint");
});

test("loyalty card: same points/tier rules as the system (paid money only, redemptions deducted)", async () => {
  const handle = await load(), w = world();
  w.recs.push({ shop_id: SHOP, deleted: false, collection: "ledger", record_id: "t1", data: { id: "t1", customerId: "c1", type: "package_purchase", amount: 0, price: 16.9, at: new Date().toISOString() } });
  w.recs.push({ shop_id: SHOP, deleted: false, collection: "ledger", record_id: "t2", data: { id: "t2", customerId: "c1", type: "adjustment", method: "loyalty", amount: 1, loyaltyPoints: 100, at: new Date().toISOString() } });
  w.recs.find((r) => r.record_id === "o1").data.status = "delivered";
  const { token } = await signIn(handle, w, "97333111111");
  const l = (await call(handle, w, { action: "home", token })).body.loyalty;
  // o1: total 1.5 paid (not on account) + package 16.9 = 18.4 BD → 184 points − 100 redeemed
  assert.equal(l.points, 84); assert.equal(l.cardNo, "997-111111"); assert.equal(l.tier, "bronze"); assert.equal(l.next.ar, "فضي");
});
