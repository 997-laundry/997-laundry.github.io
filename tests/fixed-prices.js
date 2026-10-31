// Flow tests (payments, closings, shifts…) use a fixed test price table so their expected totals do not change
// whenever the shop edits its real price list. Seeds the settings before the app starts (first load of a context only).
const prices = require("./fixtures/prices-v2.json");
module.exports = function fixedPrices(page) {
  return page.addInitScript((p) => {
    try {
      if (localStorage.getItem("l997_settings")) return;
      localStorage.setItem("l997_settings", JSON.stringify({ urgentPercent: 100, normalHours: 24, urgentHours: 6, prices: p, orderSeq: 1, catalogVersion: 3, packageDefs: [], garmentActive: {}, serviceActive: { wash: true } }));
    } catch (e) { /* storage blocked: the app falls back to its own defaults */ }
  }, prices);
};
