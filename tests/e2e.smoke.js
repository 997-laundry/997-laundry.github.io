// End-to-end smoke test: drives the real app in headless Chromium.
// Usage: node tests/e2e.smoke.js [path-to-html]   (default: laundry-997-full.html)
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "laundry-997-full.html"));
const PW = "Owner#2026pass";
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  → " + detail : ""}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({ timezoneId: "Asia/Bahrain", viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on("popup", (p) => p.close().catch(() => {}));
  await page.addInitScript(() => { window.open = () => ({ closed: false }); window.print = () => {}; });
  await page.goto("file://" + file);

  // 1) First-time owner setup
  await page.fill("#au_name", "Owner Test");
  await page.fill("#au_user", "owner");
  await page.fill("#au_pw", PW);
  await page.fill("#au_pw2", PW);
  await page.click("#au_form button[type=submit]");
  await page.check("#au_saved");
  await page.click("#au_next");
  await page.waitForSelector("body:not(.auth-locked)");
  check("owner setup + login", true);

  const quickSubmit = async () => { await page.click("#quickFormSubmitBtn"); await page.waitForTimeout(250); };
  const quickCancelIfOpen = async () => {
    await page.waitForTimeout(250);
    if (await page.isVisible("#quickFormCancelBtn")) { await page.click("#quickFormCancelBtn"); await page.waitForTimeout(150); }
  };

  // 2) Create customer + order (2 x cotton thob wash&iron = 0.600, 1 x shirt = 0.200 → 0.800)
  async function newOrder(name, phone, taps) {
    await page.click('.nav-item[data-page="new-order"]');
    await page.click("#posCustomerBarBtn");
    await page.fill("#orderCustomerPhone", phone);
    await page.waitForTimeout(100);
    if (await page.isVisible("#newCustomerFromNoResultBtn")) {
      await page.click("#newCustomerFromNoResultBtn");
      await page.fill("#customerName", name);
      await page.fill("#customerPhone", phone);
      await page.click("#saveCustomerBtn");
    } else {
      await page.click("#customerResults [data-pick]");
    }
    for (const id of taps) await page.click(`#posProductGrid [data-cloth="${id}"]`);
    await page.click("#posSaveOrderMainBtn");
    await quickCancelIfOpen(); // WhatsApp prompt → "later"
  }
  await newOrder("Ali", "33001122", ["thob_cotton", "thob_cotton", "shirt"]);
  let orders = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_orders")));
  check("order saved", orders.length === 1);
  check("order total computed", orders[0].payment.total === 0.8, orders[0].payment.total);

  // 3) Confirm payment with 0.500 cash → 0.300 debt (owner has allow_credit)
  async function pay(orderIdx, method, amount) {
    await page.click('.nav-item[data-page="orders"]');
    await page.click(`#ordersBody tr:nth-child(${orderIdx}) [data-view]`);
    await page.click("#advanceStatusBtn");
    await page.selectOption("#qf_method", method);
    await page.fill("#qf_paid", String(amount));
    await quickSubmit();
    await quickCancelIfOpen();
    if (await page.isVisible("#closeOrderDialog2")) await page.click("#closeOrderDialog2");
  }
  await pay(1, "cash", "0.5");
  orders = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_orders")));
  const custs = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_customers")));
  check("order ready after payment", orders[0].status === "ready", orders[0].status);
  check("customer debt recorded", custs[0].balance === -0.3, custs[0].balance);

  // 4) Customer pays off the 0.300 debt in cash from the Balances page
  await page.click('.nav-item[data-page="balances"]');
  await page.click('[data-bact="tab"][data-id="debtors"]');
  await page.click('[data-bact="settle"]');
  await quickSubmit();
  const bal = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_customers"))[0].balance);
  check("debt settled", bal === 0, bal);

  // 5) A second order, paid fully by card
  await newOrder("Ali", "33001122", ["shirt"]);
  await pay(1, "card", "0.2");

  // 6) Expense 0.100 cash
  await page.click('.nav-item[data-page="finance"]');
  await page.click("#addExpenseBtn");
  await page.fill("#qf_amount", "0.1");
  await quickSubmit();

  // 6b) Third order paid 0.200 cash, then cancelled with a cash refund → must not change sales or drawer
  await newOrder("Ali", "33001122", ["shirt"]);
  await pay(1, "cash", "0.2");
  await page.click('.nav-item[data-page="orders"]');
  await page.click("#ordersBody tr:nth-child(1) [data-view]");
  await page.click("#cancelOrderBtn");
  await page.fill("#qf_reason", "test cancel");
  await page.selectOption("#qf_refund", "cash");
  await quickSubmit();
  if (await page.isVisible("#closeOrderDialog2")) await page.click("#closeOrderDialog2");
  orders = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_orders")));
  check("cancelled order has a recorded cash refund", orders[0].status === "cancelled" && orders[0].refund && orders[0].refund.amount === 0.2, JSON.stringify(orders[0].refund));

  // Expected truth: sales 1.000, cash collected 0.500+0.300 cash + 0.200 card = 1.000,
  // receivables 0, expenses 0.100, profit 0.900, expected drawer cash 0.700
  const text = async (sel) => (await page.textContent(sel)) || "";
  await page.click('.nav-item[data-page="dashboard"]');
  const dash = await text("#metricsGrid");
  console.log("\nDASHBOARD:\n" + dash.replace(/\s+/g, " ").trim());
  await page.click('.nav-item[data-page="closures"]');
  const cls = await text("#dailyClosurePreview");
  console.log("\nDAILY CLOSURE:\n" + cls.replace(/\s+/g, " ").trim());
  await page.click('.nav-item[data-page="reports"]');
  const rep = await text("#reportContent");
  console.log("\nREPORTS:\n" + rep.replace(/\s+/g, " ").trim());

  if (process.env.EXPECT_FIXED) {
    const norm = (s) => s.replace(/\s+/g, " ");
    check("dashboard shows sales 1.000", /1\.000/.test(norm(dash)));
    check("closure expected cash 0.700", /0\.700/.test(norm(cls)), norm(cls));
  }

  // 6c) Approve the daily closure, then try again → must be blocked (no duplicate closures)
  await page.click('.nav-item[data-page="closures"]');
  await page.click("#closeDayBtn");
  await page.fill("#qf_cash", "0.7");
  await quickSubmit();
  await page.click("#closeDayBtn");
  await page.waitForTimeout(200);
  const closures = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_closures")));
  check("daily closure saved once with zero difference", closures.length === 1 && closures[0].variance === 0, JSON.stringify(closures.map((c) => [c.forDate, c.cashExpected, c.variance])));

  // 6d) Edit an unpaid order: 1 shirt → 3 shirts → total recalculated to 0.600, edit logged
  await newOrder("Ali", "33001122", ["shirt"]);
  await page.click('.nav-item[data-page="orders"]');
  await page.click("#ordersBody tr:nth-child(1) [data-view]");
  await page.click("#editOrderBtn");
  await page.fill("#qf_q0", "3");
  await page.fill("#qf_reason", "customer added pieces");
  await quickSubmit();
  orders = await page.evaluate(() => JSON.parse(localStorage.getItem("l997_orders")));
  check("edited order total recalculated", orders[0].payment.total === 0.6 && orders[0].items[0].qty === 3 && orders[0].editHistory.length === 1, orders[0].payment.total);
  if (await page.isVisible("#closeOrderDialog2")) await page.click("#closeOrderDialog2");

  // 7) Language persists across reload
  await page.selectOption("#langSelectTop", "en");
  await page.reload();
  await page.fill("#au_user", "owner").catch(() => {});
  const dir = await page.evaluate(() => document.documentElement.dir);
  check("English persists after reload (dir=ltr)", dir === "ltr", dir);

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
