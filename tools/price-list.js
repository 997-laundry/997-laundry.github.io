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
  body { margin: 0; font-family: Inter, Tajawal, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; height: 297mm; padding: 0 0 8mm; display: flex; flex-direction: column; }
  header { background: #1c1c1e; color: #fff; padding: 9mm 12mm 7mm; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo .mark { font: 800 46px/0.9 Inter, sans-serif; letter-spacing: -1px; }
  .logo .mark span { color: #fff; }
  .logo .word { font: 600 11px Inter, sans-serif; letter-spacing: 6px; margin-top: 5px; padding-inline-start: 3px; }
  .logo .t { font: 800 20px Inter, sans-serif; margin-top: 12px; }
  .logo .s { font: 400 9px Inter, sans-serif; color: #c9c9ce; margin-top: 2px; }
  .ar { text-align: right; direction: rtl; font-family: Tajawal, sans-serif; }
  .ar .mark { font: 800 34px/1 Tajawal, sans-serif; }
  .ar .loc { font: 500 11px Tajawal, sans-serif; color: #c9c9ce; margin-top: 4px; }
  .ar .t { font: 800 22px Tajawal, sans-serif; margin-top: 10px; }
  .ar .s { font: 400 10px Tajawal, sans-serif; color: #c9c9ce; }
  table { width: calc(100% - 20mm); margin: 5mm 10mm 0; border-collapse: collapse; font-size: 10.6px; }
  thead th { font: 800 10px Inter, sans-serif; text-align: center; padding: 0 2mm 2mm; border-bottom: 2px solid #1c1c1e; vertical-align: bottom; }
  thead th small { display: block; font: 700 10px Tajawal, sans-serif; margin-top: 1px; }
  thead th.item { text-align: left; } thead th.aritem { text-align: right; font-family: Tajawal, sans-serif; font-size: 11px; }
  tbody td { padding: 1.15mm 2mm; text-align: center; font-variant-numeric: tabular-nums; }
  tbody tr:nth-child(odd) td { background: #f1f1f3; }
  td.item { text-align: left; font-weight: 600; } td.aritem { text-align: right; direction: rtl; font: 700 11.5px Tajawal, sans-serif; }
  td.wi { font-weight: 800; } td.na { color: #9a9aa0; }
  .notes { margin: auto 10mm 0; display: flex; justify-content: space-between; gap: 8mm; background: #f1f1f3; border-radius: 3mm; padding: 3mm 5mm; font-size: 9.5px; }
  .notes .r { direction: rtl; text-align: right; font: 500 10.5px Tajawal, sans-serif; }
  .foot { margin: 2.5mm 10mm 0; display: flex; justify-content: space-between; font-size: 8.5px; color: #6b6b70; }
  .foot .r { direction: rtl; font-family: Tajawal, sans-serif; font-size: 9.5px; }
</style></head><body><div class="page">
<header>
  <div class="logo"><div class="mark">997<span>.</span></div><div class="word">LAUNDRY</div><div class="t">Price List</div><div class="s">All prices in Bahraini Dinar (BD)</div></div>
  <div class="ar"><div class="mark">مغسلة ٩٩٧</div><div class="loc">الرفاع · مملكة البحرين</div><div class="t">قائمة الأسعار</div><div class="s">جميع الأسعار بالدينار البحريني</div></div>
</header>
<table><thead><tr><th class="item">ITEM</th><th>IRON<small>كوي</small></th><th>WASH &amp; IRON<small>غسيل وكوي</small></th><th>DRY CLEAN<small>تنظيف جاف</small></th><th>URGENT<small>مستعجل</small></th><th class="aritem">الصنف</th></tr></thead>
<tbody>${rows.map((r) => `<tr><td class="item">${r.en}</td><td class="${r.iron ? "" : "na"}">${fmt(r.iron)}</td><td class="wi ${r.wi ? "" : "na"}">${fmt(r.wi)}</td><td class="${r.dc ? "" : "na"}">${fmt(r.dc)}</td><td class="${r.urgent ? "" : "na"}">${fmt(r.urgent)}</td><td class="aritem">${r.ar}</td></tr>`).join("")}</tbody></table>
<div class="notes"><div>Urgent service (wash &amp; iron) is charged as shown — normally double the regular price.<br>— = service not available. Prices per piece · Carpet priced per square metre.</div>
<div class="r">الخدمة المستعجلة (غسيل وكوي) بالسعر الموضّح — عادةً ضعف السعر العادي.<br>— = الخدمة غير متوفرة · الأسعار للقطعة الواحدة · السجاد بالمتر المربع.</div></div>
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
