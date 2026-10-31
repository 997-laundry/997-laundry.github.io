// Printable price list (A4 PDF + PNG) generated from the prices in src/app.js — always the same as the system.
// Usage: node tools/price-list.js [outDir]   (needs Playwright/Chromium; fonts load from Google Fonts)
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const src = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const objOf = (name) => { const i = src.indexOf(`const ${name} = {`); const j = src.indexOf("};", i); return Function(`return ${src.slice(src.indexOf("{", i), j + 1)}`)(); };
const PRICES = objOf("OFFICIAL_PRICES_997");
const URGENT = objOf("URGENT_PRICES_997");
const URGENT_PCT = 100; // default in Settings: urgent = double
function names(anchor) {
  const end = src.indexOf(anchor), start = src.lastIndexOf("cloth_thob_cotton:", end);
  const out = {}; for (const m of src.slice(start, end).matchAll(/cloth_(\w+): "([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
const AR = names('service_wash: "غسيل", service_iron: "كي"'), EN = names('service_wash: "Wash", service_iron: "Iron"');
// brand: logo and its two colours (navy + soft blue)
const LOGO = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "brand", "logo-997-navy.png")).toString("base64");
const NAVY = "#101E40", BLUE = "#6085C0", TINT = "#E9EFF8", LINE = "#C9D6EC";
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const fmt = (n) => (n ? n.toFixed(3) : "—");
const rows = Object.entries(PRICES).map(([id, p]) => {
  const u = URGENT[id] !== undefined ? URGENT[id] : p.washiron ? r3(p.washiron * (1 + URGENT_PCT / 100)) : 0;
  return { en: EN[id] || id, ar: AR[id] || id, iron: p.iron || 0, wi: p.washiron || 0, dc: p.dryclean || 0, urgent: u };
});

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, Tajawal, sans-serif; color: ${NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; padding: 0 0 7mm; display: flex; flex-direction: column; }
  header { background: ${BLUE}; color: ${NAVY}; padding: 6mm 12mm 5mm; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; position: relative; }
  header::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2.2mm; background: ${NAVY}; }
  header img { height: 33mm; display: block; }
  .en .t { font: 800 25px Inter, sans-serif; letter-spacing: .3px; }
  .en .s { font: 500 10px Inter, sans-serif; margin-top: 2px; opacity: .85; }
  .en .loc { font: 600 10px Inter, sans-serif; margin-top: 7px; letter-spacing: 1.5px; text-transform: uppercase; }
  .ar { text-align: right; direction: rtl; font-family: Tajawal, sans-serif; }
  .ar .t { font: 800 27px Tajawal, sans-serif; }
  .ar .s { font: 500 11px Tajawal, sans-serif; opacity: .85; }
  .ar .loc { font: 700 12px Tajawal, sans-serif; margin-top: 6px; }
  table { width: calc(100% - 20mm); margin: 5mm 10mm 0; border-collapse: separate; border-spacing: 0; font-size: 10.6px; }
  thead th { background: ${NAVY}; color: #fff; font: 800 9.5px Inter, sans-serif; text-align: center; padding: 2mm 2mm 1.6mm; vertical-align: bottom; letter-spacing: .4px; }
  thead th:first-child { border-radius: 2mm 0 0 0; } thead th:last-child { border-radius: 0 2mm 0 0; }
  thead th small { display: block; font: 700 10px Tajawal, sans-serif; margin-top: 1px; color: #D5E0F3; letter-spacing: 0; }
  thead th.item { text-align: left; } thead th.aritem { text-align: right; font: 800 11.5px Tajawal, sans-serif; }
  tbody td { padding: 1.4mm 2mm; text-align: center; font-variant-numeric: tabular-nums; border-bottom: 1px solid ${LINE}; }
  tbody tr:nth-child(even) td { background: ${TINT}; }
  td.item { text-align: left; font-weight: 600; } td.aritem { text-align: right; direction: rtl; font: 700 11.5px Tajawal, sans-serif; }
  td.wi { font-weight: 800; color: ${NAVY}; } td.na { color: #A4B3CF; }
  td.urg { font-weight: 700; color: #2F57A0; }
  .notes { margin: auto 10mm 0; display: flex; justify-content: space-between; gap: 8mm; background: ${TINT}; border-inline-start: 2mm solid ${BLUE}; border-radius: 2mm; padding: 2.6mm 5mm; font-size: 9.3px; }
  .notes .r { direction: rtl; text-align: right; font: 500 10.3px Tajawal, sans-serif; }
  .foot { margin: auto 10mm 0; display: flex; justify-content: space-between; font-size: 8.5px; color: ${BLUE}; font-weight: 600; }
  .foot .r { direction: rtl; font-family: Tajawal, sans-serif; font-size: 9.5px; }
</style></head><body><div class="page">
<header>
  <div class="en"><div class="t">Price List</div><div class="loc">Riffa · Kingdom of Bahrain</div></div>
  <img src="${LOGO}" alt="997 Laundry">
  <div class="ar"><div class="t">قائمة الأسعار</div><div class="loc">مغسلة ٩٩٧ · الرفاع</div></div>
</header>
<table><thead><tr><th class="item">ITEM</th><th>IRON<small>كوي</small></th><th>WASH &amp; IRON<small>غسيل وكوي</small></th><th>DRY CLEAN<small>تنظيف جاف</small></th><th>URGENT<small>مستعجل</small></th><th class="aritem">الصنف</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="item">${r.en}</td><td class="${r.iron ? "" : "na"}">${fmt(r.iron)}</td><td class="wi ${r.wi ? "" : "na"}">${fmt(r.wi)}</td><td class="${r.dc ? "" : "na"}">${fmt(r.dc)}</td><td class="${r.urgent ? "urg" : "na"}">${fmt(r.urgent)}</td><td class="aritem">${r.ar}</td></tr>`).join("")}</tbody></table>
<div class="foot"><span>997 Laundry · Riffa, Kingdom of Bahrain</span><span class="r">مغسلة ٩٩٧ · الرفاع · مملكة البحرين</span></div>
</div></body></html>`;

(async () => {
  const out = path.resolve(process.argv[2] || path.join(__dirname, "..", "docs"));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "price-list-997.html"), html);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => document.querySelector(".page").scrollHeight > document.querySelector(".page").clientHeight + 1);
  await page.pdf({ path: path.join(out, "price-list-997.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await page.screenshot({ path: path.join(out, "price-list-997.png"), fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ items: rows.length, overflow, out }));
})().catch((e) => { console.error(e); process.exit(1); });
