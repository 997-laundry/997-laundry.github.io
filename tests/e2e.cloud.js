// Cloud sync test: two devices against the local Supabase stand-in (real PostgreSQL + the real security rules).
// Owner device links and uploads → owner adds a worker (cloud account) → a new device joins from the cloud →
// worker changes the temporary password, sees orders but not expenses, creates an order with a server-reserved
// number → owner device receives it while idle → offline work is uploaded when back online → edit conflict is
// resolved in favour of the cloud and logged → password hashes never reach the cloud.
// Usage: node tests/e2e.cloud.js [path-to-html]   (needs a local PostgreSQL server, run as root)
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const serve = require("./serve");
const { startStandin } = require("./supabase-standin");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "laundry-997-full.html"));
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  → " + detail : ""}`);
  if (!cond) failures++;
}
const OWNER_PW = "Owner#2026pass", WORKER_NEW_PW = "Worker#2026new";

(async () => {
  const cloud = await startStandin({ latencyMs: Number(process.env.CLOUD_LATENCY_MS || 150) }); // a far-away server, like the real one
  const url = await serve(file);
  const browser = await chromium.launch();
  const errors = [];
  async function device(tag) {
    const ctx = await browser.newContext({ timezoneId: "Asia/Bahrain", viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`[${tag}] ${e.message}`));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.addInitScript((cfg) => { window.__L997_CLOUD_CONFIG = cfg; window.open = () => ({ closed: false }); window.print = () => {}; HTMLAnchorElement.prototype.click = function () {}; },
      { url: cloud.url, key: "sb_publishable_test", pollMs: 1200, idleMs: 400 });
    await page.goto(url);
    return page;
  }
  const helpers = (page) => ({
    nav: (pg) => page.evaluate((pg) => document.querySelector(`.nav-item[data-page="${pg}"]`).click(), pg),
    submit: async () => { await page.click("#quickFormSubmitBtn"); await page.waitForTimeout(300); },
    later: async () => { await page.waitForTimeout(250); if (await page.isVisible("#quickFormCancelBtn")) { await page.click("#quickFormCancelBtn"); await page.waitForTimeout(150); } else if (await page.isVisible("#quickFormSubmitBtn") && /واتساب|WhatsApp/.test(await page.textContent("#quickFormSubmitBtn"))) { await page.click("#quickFormSubmitBtn"); await page.waitForTimeout(200); } },
    closeDialogs: () => page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close())),
    ls: (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), k),
    cloudStatus: () => page.evaluate(() => window.L997Cloud.status()),
  });
  const rows = async (collection) => (await cloud.query("select record_id, data, deleted, version from public.records where collection = $1 and not deleted", [collection])).rows;
  // waits for a condition; tolerates the page refreshing itself (devices reload after applying cloud updates)
  const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (e) { /* page was refreshing */ } await new Promise((r) => setTimeout(r, 250)); } return false; };

  // ---------------- device A: owner, works locally first ----------------
  const A = await device("A"); const a = helpers(A);
  await A.fill("#au_name", "Owner"); await A.fill("#au_user", "owner"); await A.fill("#au_pw", OWNER_PW); await A.fill("#au_pw2", OWNER_PW);
  await A.click("#au_form button[type=submit]"); await A.check("#au_saved"); await A.click("#au_next");
  await A.waitForSelector("body:not(.auth-locked)");
  check("not linked yet: no cloud indicator, nothing sent", !(await A.isVisible("#cloudChip")) && cloud.requests === 0, cloud.requests);
  await a.nav("new-order");
  await A.click("#posCustomerBarBtn"); await A.fill("#orderCustomerPhone", "33001122");
  await A.click("#newCustomerFromNoResultBtn"); await A.fill("#customerName", "Ali"); await A.fill("#customerPhone", "33001122"); await A.click("#saveCustomerBtn");
  await A.click('#posProductGrid [data-cloth="shirt"]'); await A.click("#posSaveOrderMainBtn"); await a.later();
  await a.nav("finance"); await A.click("#addExpenseBtn"); await A.fill("#qf_amount", "5"); await a.submit();

  // link + upload
  await a.nav("profile");
  await A.waitForSelector("#cloudLinkBtn");
  await A.click("#cloudLinkBtn");
  await A.fill("#qf_pw", OWNER_PW); await A.fill("#qf_c", "رفع");
  await A.click("#quickFormSubmitBtn");
  check("owner links and uploads the device's data", await until(async () => (await rows("orders")).length === 1 && (await rows("expenses")).length === 1 && (await rows("customers")).length === 1), JSON.stringify([(await rows("orders")).length, (await rows("expenses")).length]));
  const empRows = await rows("employees");
  check("password hashes and salts never reach the cloud", empRows.length === 1 && !JSON.stringify(empRows).match(/passHash|"salt"|password/), Object.keys(empRows[0] ? empRows[0].data : {}).join(","));
  check("owner's employee record knows its cloud account", !!(empRows[0] && empRows[0].data.cloudUserId));
  const sec = await rows("security");
  check("recovery code hash stays on the device", sec.length === 1 && !("recoveryHash" in sec[0].data));
  const set = await rows("settings");
  check("prices uploaded, local order counter not", set.length === 1 && set[0].data.prices && !("orderSeq" in set[0].data));
  await A.waitForTimeout(2500);
  const afterLink = await a.cloudStatus();
  check("no false conflicts right after linking (upload and sync never overlap)", afterLink.conflicts === 0 && afterLink.rejected === 0, JSON.stringify(afterLink.conflictList));
  await A.waitForSelector("#cloudChip");
  check("cloud indicator shows synced", await until(async () => /متزامن/.test(await A.textContent("#cloudChip"))), await A.textContent("#cloudChip"));

  // owner adds a worker → cloud account + membership
  await a.nav("access"); await A.click("#accessAddUserBtn");
  await A.fill("#qf_name", "Worker One"); await A.selectOption("#qf_role", "worker"); await A.fill("#qf_username", "worker1");
  const tempPw = await A.inputValue("#qf_password");
  await A.click("#quickFormSubmitBtn");
  check("worker account created in the cloud with role worker", await until(async () => (await cloud.query("select m.role from public.shop_members m join auth.users u on u.id = m.user_id where u.email = 'worker1@997laundry.app'")).rows[0]?.role === "worker"));
  await a.later(); await a.closeDialogs();
  check("worker's employee record reaches the cloud", await until(async () => (await rows("employees")).some((r) => r.data.username === "worker1" && r.data.cloudUserId)));

  // ---------------- device B: a new device joins from the cloud ----------------
  const B = await device("B"); const b = helpers(B);
  await B.waitForSelector("#au_cloud_join");
  await B.click("#au_cloud_join");
  await B.fill("#au_user", "worker1"); await B.fill("#au_pass", tempPw);
  await Promise.all([B.waitForEvent("load"), B.click("#au_form button[type=submit]")]);
  await B.waitForSelector("#au_user");
  check("after joining: login screen (not first-time setup) with a notice", (await B.isVisible("#au_pass")) && /تنزيل بيانات المحل/.test(await B.textContent("#au_err")), await B.textContent("#au_err"));
  check("joined device received orders and customers", (await b.ls("l997_orders")).length === 1 && (await b.ls("l997_customers")).length === 1);
  check("worker device did not receive expenses", ((await b.ls("l997_expenses")) || []).length === 0);
  await B.waitForTimeout(150);
  await B.fill("#au_user", "worker1"); await B.fill("#au_pass", tempPw); await B.click("#au_form button[type=submit]");
  await B.waitForSelector("#au_pw2"); await B.waitForTimeout(150);
  await B.fill("#au_pw", WORKER_NEW_PW); await B.fill("#au_pw2", WORKER_NEW_PW); await B.click("#au_form button[type=submit]");
  await B.waitForSelector("body:not(.auth-locked)");
  const pwOk = await cloud.query("select encrypted_password = extensions.crypt($1, encrypted_password) as ok from auth.users where email = 'worker1@997laundry.app'", [WORKER_NEW_PW]);
  check("forced password change also changed the cloud password", pwOk.rows[0].ok === true);
  await B.waitForSelector("#qf_opening"); await B.fill("#qf_opening", "0"); await B.click("#quickFormSubmitBtn"); await B.waitForTimeout(300);

  // worker creates an order → number reserved by the server, uploaded
  await b.nav("new-order");
  await B.click("#posCustomerBarBtn"); await B.fill("#orderCustomerPhone", "33001122"); await B.waitForTimeout(150);
  await B.click("#customerResults [data-pick]");
  await B.click('#posProductGrid [data-cloth="shirt"]'); await B.click('#posProductGrid [data-cloth="shirt"]');
  await B.click("#posSaveOrderMainBtn"); await b.later(); await b.closeDialogs();
  const bOrders = await b.ls("l997_orders");
  check("worker's order uploaded", await until(async () => (await rows("orders")).length === 2));
  const nums = (await rows("orders")).map((r) => r.data.number).sort();
  check("order numbers are unique across devices", new Set(nums).size === 2, nums.join(","));
  check("worker's shift uploaded", await until(async () => (await rows("shifts")).length === 1));

  // device A (idle) picks up the worker's order and refreshes itself
  await a.nav("dashboard"); await A.mouse.move(5, 5);
  check("owner device receives the worker's order while idle", await until(async () => ((await a.ls("l997_orders")) || []).length === 2, 20000));
  await A.waitForSelector("body:not(.auth-locked)");
  check("owner stays signed in after the automatic refresh", !(await A.evaluate(() => document.body.classList.contains("auth-locked"))));

  // offline on A: work continues, uploads later
  cloud.setOffline(true);
  await a.nav("finance"); await A.click("#addExpenseBtn"); await A.fill("#qf_amount", "2"); await a.submit();
  await A.waitForTimeout(2500);
  check("offline: indicator says it will upload later", /بدون إنترنت/.test(await A.textContent("#cloudChip")), await A.textContent("#cloudChip"));
  cloud.setOffline(false);
  check("back online: the offline expense is uploaded", await until(async () => (await rows("expenses")).length === 2, 20000));

  // edit conflict: both devices change the same customer; the first upload wins, the other is logged
  const custId = (await a.ls("l997_customers"))[0].id;
  cloud.setOffline(true);
  await A.evaluate((id) => { const l = JSON.parse(localStorage.getItem("l997_customers")); l.find((c) => c.id === id).notes = "from A"; localStorage.setItem("l997_customers", JSON.stringify(l)); }, custId);
  await B.evaluate((id) => { const l = JSON.parse(localStorage.getItem("l997_customers")); l.find((c) => c.id === id).notes = "from B"; localStorage.setItem("l997_customers", JSON.stringify(l)); }, custId);
  await A.waitForTimeout(800);
  cloud.setOffline(false);
  await B.evaluate(() => window.L997Cloud.syncNow());
  check("first upload wins", await until(async () => (await rows("customers"))[0].data.notes === "from B"));
  await A.evaluate(() => window.L997Cloud.syncNow());
  check("second device's edit is not silently lost: logged as a conflict", await until(async () => (await a.cloudStatus()).conflicts >= 1));
  await A.waitForLoadState("load");
  check("device A now shows the cloud's value", await until(async () => (await a.ls("l997_customers")).find((c) => c.id === custId).notes === "from B"));
  check("cloud keeps one consistent value", (await rows("customers"))[0].data.notes === "from B");

  // a worker cannot push expenses even if the data is changed on the device
  await B.waitForLoadState("load");
  await until(async () => B.evaluate(() => !!window.L997Cloud));
  await B.evaluate(() => { localStorage.setItem("l997_expenses", JSON.stringify([{ id: "fake-exp", amount: 999, category: "x" }])); });
  await B.evaluate(() => window.L997Cloud.syncNow());
  await B.waitForTimeout(500);
  check("worker device cannot add expenses to the cloud", !(await rows("expenses")).some((r) => r.record_id === "fake-exp"));
  check("change history is kept on the server", (await cloud.query("select count(*)::int as n from public.record_history")).rows[0].n > 10);

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  await cloud.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CLOUD CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
