// Receipt link on WhatsApp: pressing "confirm delivery" opens WhatsApp on the customer's chat with the thank-you
// message + a receipt link (one tap: Send). The customer opens the link on any phone — no app, no login — and sees
// the receipt image with Save / Share. Works when a worker delivers; only that one receipt is readable; a wrong
// link shows a clear message. Runs against the local Supabase stand-in (real PostgreSQL + setup.sql).
// Usage: node tests/e2e.receiptlink.js [path-to-html]   (needs a local PostgreSQL server, run as root)
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const serve = require("./serve");
const { startStandin } = require("./supabase-standin");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "laundry-997-full.html"));
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  → " + String(detail).replace(/\n/g, " ⏎ ").slice(0, 300) : ""}`);
  if (!cond) failures++;
}
const OWNER_PW = "Owner#2026pass", WORKER_PW = "Worker#2026new";

(async () => {
  const cloud = await startStandin({ latencyMs: 60 });
  const url = await serve(file);
  const browser = await chromium.launch();
  const errors = [];
  async function device(tag, ua) {
    const ctx = await browser.newContext({ timezoneId: "Asia/Bahrain", viewport: { width: 1280, height: 900 }, ...(ua ? { userAgent: ua, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}) });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.addInitScript((cfg) => {
      window.__L997_CLOUD_CONFIG = cfg; window.print = () => {};
      window.open = (u) => { const a = JSON.parse(sessionStorage.getItem("__wa") || "[]"); a.push(u); sessionStorage.setItem("__wa", JSON.stringify(a)); return { closed: false }; };
    }, { url: cloud.url, key: "k" });
    return page;
  }
  const H = (P) => ({
    wait: (ms) => P.waitForTimeout(ms),
    nav: (pg) => P.evaluate((pg) => document.querySelector(`.nav-item[data-page="${pg}"]`).click(), pg),
    closeAll: () => P.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())),
    ls: (k) => P.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), k),
    wa: async () => { const a = await P.evaluate(() => JSON.parse(sessionStorage.getItem("__wa") || "[]")); return a.map((u) => decodeURIComponent(u.split("text=")[1] || "")); },
    status: () => P.evaluate(() => window.L997Cloud.status()),
  });
  const until = async (fn, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 300)); } return false; };
  async function order(P, h, name, phone, shirts, existing) {
    await h.closeAll(); await h.nav("new-order");
    await P.click("#posCustomerBarBtn"); await P.fill("#orderCustomerPhone", phone); await h.wait(250);
    if (existing) await P.click("#customerResults [data-pick]");
    else { await P.click("#newCustomerFromNoResultBtn"); await P.fill("#customerName", name); await P.fill("#customerPhone", phone); await P.click("#saveCustomerBtn"); }
    for (let i = 0; i < shirts; i++) await P.click('#posProductGrid [data-cloth="shirt"]');
    await P.click("#posSaveOrderMainBtn"); await h.wait(600);
    if (await P.isVisible("#quickFormSubmitBtn")) { await P.click("#quickFormSubmitBtn"); await h.wait(200); } // order confirmation
    await h.closeAll();
    return (await h.ls("l997_orders"))[0];
  }
  async function openOrder(P, h, id) { await h.closeAll(); await h.nav("orders"); await until(() => P.evaluate((id) => !!document.querySelector(`#ordersBody [data-view="${id}"]`), id), 15000); await P.evaluate((id) => document.querySelector(`#ordersBody [data-view="${id}"]`).click(), id); await h.wait(200); }
  async function readyCash(P, h, id, paid) { await openOrder(P, h, id); await P.click("#advanceStatusBtn"); await P.selectOption("#qf_method", "cash"); await P.fill("#qf_paid", String(paid)); await P.click("#quickFormSubmitBtn"); await h.wait(400); if (await P.isVisible("#quickFormCancelBtn")) await P.click("#quickFormCancelBtn"); await h.closeAll(); }
  async function deliver(P, h, id, pieces) { await openOrder(P, h, id); await P.click("#advanceStatusBtn"); await P.fill("#qf_count", String(pieces)); await P.click("#quickFormSubmitBtn"); await h.wait(500); }
  const linkOf = (text) => (/(https?:\/\/\S+r\.html\?t=[\w-]+)/.exec(text) || [])[1];

  /* owner device A: shop + cloud + a worker */
  const A = await device("A"); const a = H(A);
  await A.goto(url);
  await A.fill("#au_name", "Owner"); await A.fill("#au_user", "owner"); await A.fill("#au_pw", OWNER_PW); await A.fill("#au_pw2", OWNER_PW);
  await A.click("#au_form button[type=submit]"); await A.check("#au_saved"); await A.click("#au_next"); await A.waitForSelector("body:not(.auth-locked)");
  await a.nav("profile"); await A.click("#cloudLinkBtn"); await A.fill("#qf_pw", OWNER_PW); await A.fill("#qf_c", "رفع"); await A.click("#quickFormSubmitBtn");
  check("A linked to the cloud", await until(async () => (await a.status()).linked && (await a.status()).pending === 0));
  await until(async () => !(await A.evaluate(() => { const b = document.getElementById("quickFormSubmitBtn"); return document.getElementById("quickFormDialog").open && b.disabled; })));
  await a.wait(1200); await a.closeAll();

  /* 1) owner: order 5 shirts (0.400 each), paid 0.400 of 2.000, delivered → WhatsApp opens at once with thanks + receipt link */
  const o1 = await order(A, a, "Ali Link", "33445566", 5);
  await readyCash(A, a, o1.id, 0.4);
  const before = (await a.wa()).length;
  await deliver(A, a, o1.id, 5);
  const msgs = await a.wa();
  const m1 = msgs[msgs.length - 1] || "";
  check("confirm delivery → WhatsApp opens straight away (no second 'send?' question)", msgs.length === before + 1 && !(await A.isVisible("#quickFormSubmitBtn")), msgs.length - before);
  check("…to the customer's chat with the thank-you message and remaining 1.600", /تم تسليم طلبك/.test(m1) && /المتبقي على هذا الطلب 1\.600/.test(m1), m1);
  const link1 = linkOf(m1);
  check("…and a receipt link (r.html?t=<long random code>)", !!link1 && /t=[\w-]{20,}$/.test(link1), link1);
  check("the receipt reaches the cloud with the order", await until(async () => (await cloud.query("select 1 from public.records where collection='orders' and data->'receiptPub'->>'token' is not null")).rowCount >= 1));

  /* 2) the customer opens the link on an iPhone — no login, nothing installed */
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const C = await device("customer", iphone);
  await C.goto(link1); await C.waitForSelector("#rImg", { timeout: 15000 }).catch(() => {});
  const view = await C.evaluate(() => { const i = document.getElementById("rImg"); return i ? { w: i.naturalWidth, h: i.naturalHeight, save: !!document.getElementById("rSave"), auth: !!document.getElementById("au_form") } : null; });
  check("customer's phone shows the receipt image (Save button, no login screen)", view && view.w === 760 && view.h > 600 && view.save && !view.auth, JSON.stringify(view));
  if (process.env.SHOT) await C.screenshot({ path: process.env.SHOT, fullPage: true });
  const model = await C.evaluate((t) => window.L997Cloud.publicReceipt(t), new URL(link1).searchParams.get("t"));
  const mm = model.model || {};
  check("receipt shows order #, total 2.000, paid 0.400 and balance due 1.600", mm.number === o1.number && /2\.000/.test(mm.total) && JSON.stringify(mm.paidRows).includes("0.400") && /1\.600/.test(mm.status.text), JSON.stringify({ n: mm.number, total: mm.total, st: mm.status }));
  check("the customer's phone number is partly hidden on the shared receipt", /33••••66/.test(mm.custPhone || ""), mm.custPhone);
  const [dl] = await Promise.all([C.waitForEvent("download", { timeout: 5000 }).catch(() => null), C.click("#rSave")]);
  check("'Save image' downloads the receipt PNG", dl && /997-laundry-receipt-\d+\.png$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());

  /* 3) privacy: a wrong code shows nothing; the public key cannot read the shop's records */
  await C.goto(link1.replace(/t=[\w-]+/, "t=wrongwrongwrongwrongwrong")); await C.waitForTimeout(1500);
  check("a wrong / old link shows 'receipt not available' (no data)", /الإيصال غير متوفر/.test(await C.textContent("body")));
  await C.goto(link1.replace(/t=[\w-]+/, "t=abc")); await C.waitForTimeout(500);
  check("an incomplete link says so", /الرابط غير مكتمل/.test(await C.textContent("body")));
  const leak = await C.evaluate(async (u) => { try { const r = await fetch(u + "/rest/v1/records?select=data", { headers: { apikey: "k" } }); return { s: r.status, t: (await r.text()).slice(0, 80) }; } catch (e) { return { s: 0 }; } }, cloud.url);
  check("without logging in nobody can list the shop's records", leak.s >= 400 || leak.t === "[]", JSON.stringify(leak));
  await C.context().close();

  /* 4) the order screen has 'receipt link on WhatsApp' — same link again, updated */
  await openOrder(A, a, o1.id); await A.click("#dialogReceiptLinkBtn"); await a.wait(200);
  const m2 = (await a.wa()).pop();
  check("order screen: 'receipt link on WhatsApp' sends the same link with a short message", linkOf(m2) === link1 && /هذا إيصال طلبك رقم/.test(m2), m2);

  /* 5) a worker delivers on their own device → same automatic message + working link */
  await a.closeAll(); await a.nav("access"); await A.click("#accessAddUserBtn");
  await A.fill("#qf_name", "Worker One"); await A.selectOption("#qf_role", "worker"); await A.fill("#qf_username", "worker1");
  const tempPw = await A.inputValue("#qf_password"); await A.click("#quickFormSubmitBtn");
  await until(async () => (await cloud.query("select 1 from auth.users where email = 'worker1@997laundry.app'")).rowCount === 1);
  await A.waitForFunction(() => !document.getElementById("quickFormSubmitBtn").disabled, null, { timeout: 15000 }).catch(() => {});
  await a.wait(1200); await a.closeAll();
  const B = await device("B"); const b = H(B);
  await B.goto(url); await B.waitForSelector("#au_cloud_join"); await B.click("#au_cloud_join");
  await B.fill("#au_user", "worker1"); await B.fill("#au_pass", tempPw);
  await Promise.all([B.waitForEvent("load", { timeout: 40000 }), B.click("#au_form button[type=submit]")]);
  await B.waitForSelector("#au_user"); await b.wait(150);
  await B.fill("#au_user", "worker1"); await B.fill("#au_pass", tempPw); await B.click("#au_form button[type=submit]");
  await B.waitForSelector("#au_pw2"); await b.wait(150);
  await B.fill("#au_pw", WORKER_PW); await B.fill("#au_pw2", WORKER_PW); await B.click("#au_form button[type=submit]");
  await B.waitForSelector("body:not(.auth-locked)"); await b.wait(800); await b.closeAll();
  const o2 = await order(B, b, "", "33445566", 2, true); // 0.800
  await readyCash(B, b, o2.id, 0.8);
  await deliver(B, b, o2.id, 2);
  const mw = (await b.wa()).pop() || "";
  const link2 = linkOf(mw);
  check("worker delivery: WhatsApp opens with thanks + receipt link", /تم تسليم طلبك/.test(mw) && !!link2 && link2 !== link1, mw);
  check("worker's receipt is saved in the cloud (allowed for workers)", await until(async () => (await cloud.query("select 1 from public.records where collection='orders' and record_id=$1 and data->'receiptPub'->>'token' is not null", [o2.id])).rowCount === 1));
  const C2 = await device("customer2", iphone);
  await C2.goto(link2); await C2.waitForSelector("#rImg", { timeout: 15000 }).catch(() => {});
  const m3 = await C2.evaluate((t) => window.L997Cloud.publicReceipt(t), new URL(link2).searchParams.get("t"));
  check("…customer opens it: fully paid 0.800", m3.model && /مدفوع بالكامل/.test(m3.model.status.text) && /0\.800/.test(m3.model.total), JSON.stringify(m3.model && m3.model.status));

  /* 6) server feature not installed yet (receipt_link.sql not run) → no broken links: the usual "send?" question */
  require("child_process").execFileSync("su", ["postgres", "-c", `psql -X -q -d ${cloud.db} -c "drop function public.public_receipt(text)"`]);
  await A.reload(); await A.waitForSelector("body:not(.auth-locked)"); await a.wait(2500); await a.closeAll();
  const o3 = await order(A, a, "", "33445566", 1, true);
  await readyCash(A, a, o3.id, 0.4);
  const n3 = (await a.wa()).length;
  await deliver(A, a, o3.id, 1);
  const asked = await A.isVisible("#quickFormSubmitBtn");
  check("without the server function: no link is sent, the delivery 'send message?' question appears instead", asked && (await a.wa()).length === n3, asked);
  if (asked) { await A.click("#quickFormSubmitBtn"); await a.wait(200); }
  const m4 = (await a.wa()).pop() || "";
  check("…and the message sent from it has no receipt link", /تم تسليم طلبك/.test(m4) && !linkOf(m4), m4);
  await a.closeAll(); await a.nav("profile"); await a.wait(300);
  check("profile → cloud panel tells the owner to run supabase/receipt_link.sql", /receipt_link\.sql/.test(await A.textContent("#cloudPanel")));

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close(); await cloud.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL RECEIPT-LINK CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
