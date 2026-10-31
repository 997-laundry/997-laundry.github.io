// Settings → prices: switching a product off/on must never lose prices; the wash-only service can be switched off.
// Usage: node tests/e2e.pricing.js [path-to-html]
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const serve = require("./serve");

const file = path.resolve(process.argv[2] || path.join(__dirname, "..", "laundry-997-full.html"));
let failures = 0;
function check(name, cond, detail) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail !== undefined ? "  → " + detail : ""}`);
  if (!cond) failures++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ timezoneId: "Asia/Bahrain", viewport: { width: 1280, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.goto(await serve(file));
  const PW = "Owner#2026pass";
  await page.fill("#au_name", "Owner"); await page.fill("#au_user", "owner"); await page.fill("#au_pw", PW); await page.fill("#au_pw2", PW);
  await page.click("#au_form button[type=submit]"); await page.check("#au_saved"); await page.click("#au_next");
  await page.waitForSelector("body:not(.auth-locked)");
  const nav = (pg) => page.evaluate((pg) => document.querySelector(`.nav-item[data-page="${pg}"]`).click(), pg);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem("l997_settings")));
  const toPricing = async () => { await nav("dashboard"); await nav("settings"); await page.click('[data-settings-tab="pricing"]'); };

  await toPricing();
  // 1) edit prices, then switch the product off and on before pressing Save
  await page.fill('[data-price="shirt_iron"]', "0.444"); await page.fill('[data-price="shirt_dryclean"]', "0.9");
  await page.uncheck('[data-garment-active="shirt"]'); await page.check('[data-garment-active="shirt"]');
  const shown = [await page.inputValue('[data-price="shirt_iron"]'), await page.inputValue('[data-price="shirt_dryclean"]')];
  check("typed prices stay on screen after switching the product off and on", shown[0] === "0.444" && shown[1] === "0.9", shown.join(" / "));
  await page.click("#savePricesBtn"); await page.waitForTimeout(250);
  let s = await saved();
  check("…and are saved", s.prices.shirt_iron === 0.444 && s.prices.shirt_dryclean === 0.9, JSON.stringify([s.prices.shirt_iron, s.prices.shirt_dryclean]));
  // 2) saved prices survive switching off, refresh, switching on
  await page.uncheck('[data-garment-active="shirt"]'); await page.waitForTimeout(150);
  await page.reload(); await page.waitForSelector("body:not(.auth-locked)"); await toPricing();
  check("switched-off product stays off after refresh, prices kept", (await saved()).garmentActive.shirt === false && (await saved()).prices.shirt_iron === 0.444);
  await page.check('[data-garment-active="shirt"]'); await page.waitForTimeout(150);
  await page.reload(); await page.waitForSelector("body:not(.auth-locked)"); await toPricing();
  s = await saved();
  check("switched back on: same prices as before (nothing reset to the default list)", s.garmentActive.shirt !== false && s.prices.shirt_iron === 0.444 && s.prices.shirt_dryclean === 0.9 && (await page.inputValue('[data-price="shirt_iron"]')) === "0.444", JSON.stringify([s.prices.shirt_iron, s.prices.shirt_dryclean]));

  if (process.env.SKIP_WASH !== "1") {
    // 3) wash-only service switched off; iron, wash & iron and dry clean stay
    await nav("new-order");
    await page.click("#posCustomerBarBtn"); await page.fill("#orderCustomerPhone", "33001122");
    await page.click("#newCustomerFromNoResultBtn"); await page.fill("#customerName", "Ali"); await page.fill("#customerPhone", "33001122"); await page.click("#saveCustomerBtn");
    await page.click('#posProductGrid [data-cloth="thob_cotton"]');
    const opts = await page.$$eval("[data-service-change] option", (os) => os.map((o) => o.value));
    check("order screen: wash-only is not offered; iron, wash & iron available (and dry clean when priced)", !opts.includes("wash") && opts.includes("iron") && opts.includes("washiron"), opts.join(","));
    const def = await page.$eval("[data-service-change]", (el) => el.value);
    check("tapping a garment never picks wash-only", def !== "wash", def);
    await page.click('#posProductGrid [data-cloth="shirt"]');
    const shirtOpts = await page.$$eval("[data-service-change]", (els) => [...els[els.length - 1].options].map((o) => o.value));
    check("dry clean offered where it has a price", shirtOpts.includes("dryclean"), shirtOpts.join(","));
    // the setting itself can switch wash back on
    await toPricing();
    const washToggle = await page.$('[data-service-active="wash"]');
    check("Settings show an on/off switch per service (wash is off)", !!washToggle && !(await washToggle.isChecked()));
    const before = JSON.stringify((await saved()).prices);
    await washToggle.check(); await page.waitForTimeout(150); await washToggle.uncheck(); await page.waitForTimeout(150);
    check("switching a service on/off never changes any price", JSON.stringify((await saved()).prices) === before);
  }
  // 4) the shop's own price list (26 items, iron / wash & iron)
  const LIST = { abaya_plain: [0.5, 1], bathtowel: [0, 0.5], bedsheet_single: [0.3, 0.5], blanket_single: [0, 1.5], bisht: [1, 2.5], carpet_m2: [0, 1.5],
    cap: [0, 0.5], overcoat: [0.8, 1.2], duvet: [0, 1.5], bedcover: [0.4, 0.8], dress: [0.3, 0.6], dupatta: [0.2, 0.3], ghatra: [0.2, 0.3], gahfiya: [0, 0.2],
    pants_short: [0.2, 0.3], tshirt_half: [0.2, 0.3], kurta_pyjama: [0.2, 0.5], pants_long: [0.2, 0.3], shirt: [0.2, 0.3], skirtlong: [0.2, 0.3],
    suit2pcs: [1, 1.5], socks: [0, 0.2], tablecloth: [0.3, 0.5], thob_cotton: [0.2, 0.5], tshirt: [0.2, 0.3], underwear: [0.1, 0.2] };
  const fresh = await browser.newContext({ timezoneId: "Asia/Bahrain" });
  const F = await fresh.newPage(); F.on("pageerror", (e) => errors.push(e.message));
  await F.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await F.goto(await serve(file));
  await F.fill("#au_name", "Owner"); await F.fill("#au_user", "owner"); await F.fill("#au_pw", PW); await F.fill("#au_pw2", PW);
  await F.click("#au_form button[type=submit]"); await F.check("#au_saved"); await F.click("#au_next"); await F.waitForSelector("body:not(.auth-locked)");
  const fs = await F.evaluate(() => JSON.parse(localStorage.getItem("l997_settings")));
  const wrong = Object.entries(LIST).filter(([id, [ir, wi]]) => (fs.prices[id + "_iron"] || 0) !== ir || (fs.prices[id + "_washiron"] || 0) !== wi).map(([id]) => id);
  check("every item of the shop's price list has exactly its iron / wash & iron price", wrong.length === 0, wrong.join(","));
  await F.evaluate(() => document.querySelector('.nav-item[data-page="new-order"]').click());
  const tiles = await F.$$eval("#posProductGrid [data-cloth]", (b) => b.map((x) => x.dataset.cloth));
  check("order screen shows exactly the 26 listed products", tiles.length === 26 && tiles.every((id) => LIST[id]), `${tiles.length}: ${tiles.filter((id) => !LIST[id]).join(",")}`);
  const names = await F.$$eval("#posProductGrid .pos-tile-name", (els) => els.map((e) => e.textContent.trim()));
  check("new items present by name (بشت, سجاد, دوبتا, قحفية, نص كم)", ["بشت", "سجاد", "دوبتا", "قحفية", "نص كم"].every((n) => names.some((x) => x.includes(n))), names.slice(0, 6).join(" | "));
  await fresh.close();
  // 5) upgrade of an existing shop: old prices replaced, own dry-clean prices and urgent % kept, old products only switched off
  const up = await browser.newContext({ timezoneId: "Asia/Bahrain" });
  const U = await up.newPage(); U.on("pageerror", (e) => errors.push(e.message));
  await U.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await U.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("l997_settings", JSON.stringify({ urgentPercent: 50, normalHours: 24, urgentHours: 6, catalogVersion: 2, orderSeq: 7, packageDefs: [], garmentActive: { shirt: false }, prices: { shirt_iron: 0.35, shirt_washiron: 0.2, shirt_dryclean: 0.9, thob_wool_iron: 0.65 } })); localStorage.setItem("l997_orders", JSON.stringify([{ id: "o1", number: "00001", customerId: "c", items: [{ clothingId: "thob_wool", serviceId: "iron", qty: 1, unit: 0.65, total: 0.65 }], status: "delivered", payment: { total: 0.65, paid: 0.65, method: "cash" }, paymentConfirmed: true, createdAt: "2026-10-01T10:00:00Z" }])); } });
  await U.goto(await serve(file));
  const us = await U.evaluate(() => JSON.parse(localStorage.getItem("l997_settings")));
  check("upgrade: new list prices applied (shirt iron 0.200, wash & iron 0.300)", us.prices.shirt_iron === 0.2 && us.prices.shirt_washiron === 0.3, JSON.stringify([us.prices.shirt_iron, us.prices.shirt_washiron]));
  check("upgrade: own dry-clean price kept (shirt 0.900)", us.prices.shirt_dryclean === 0.9);
  check("upgrade: urgent percentage and order counter untouched", us.urgentPercent === 50 && us.orderSeq === 7, JSON.stringify([us.urgentPercent, us.orderSeq]));
  check("upgrade: products not on the list switched off (not deleted); listed ones on", us.garmentActive.thob_wool === false && us.garmentActive.shirt === true && us.garmentActive.bisht === true);
  const oldOrder = await U.evaluate(() => JSON.parse(localStorage.getItem("l997_orders"))[0]);
  check("upgrade: old orders keep their items and amounts", oldOrder.items[0].clothingId === "thob_wool" && oldOrder.payment.total === 0.65);
  await up.close();

  check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL PRICING CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
