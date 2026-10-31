// Flow tests (payments, closings, shifts…) use a fixed test price table so their expected totals do not change
// whenever the shop edits its real price list. Seeds the settings before the app starts (first load of a context only).
const fs = require("fs");
const path = require("path");
const prices = require("./fixtures/prices-v2.json");
// the app replaces prices when the catalogue version differs — use the app's current version
const CATALOG = Number((/const CATALOG_VERSION = (\d+)/.exec(fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8")) || [])[1]) || 0;
module.exports = function fixedPrices(page) {
  return page.addInitScript(([p, v]) => {
    try {
      if (localStorage.getItem("l997_settings")) return;
      localStorage.setItem("l997_settings", JSON.stringify({ urgentPercent: 100, normalHours: 24, urgentHours: 6, prices: p, orderSeq: 1, catalogVersion: v, packageDefs: [], garmentActive: {}, serviceActive: { wash: true } }));
    } catch (e) { /* storage blocked: the app falls back to its own defaults */ }
  }, [prices, CATALOG]);
};
