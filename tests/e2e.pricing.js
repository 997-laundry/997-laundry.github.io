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
    check("wash prices are kept while the service is off", (await saved()).prices.thob_cotton_wash > 0);
  }
  check("no JavaScript errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL PRICING CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
