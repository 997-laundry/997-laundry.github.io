// Builds the single-file app: inlines src/styles.css and every <script src> into laundry-997-full.html.
// Usage: node tools/build.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");

let html = src("index.html");
html = html.replace('  <link rel="stylesheet" href="styles.css" />', () => "  <style>\n" + src("styles.css") + "\n</style>");
html = html.replace(/    <script src="([\w.-]+)"><\/script>/g, (_, f) => "    <script>\n" + src(f) + "\n</script>");
if (/<script src=|href="styles\.css"/.test(html)) throw new Error("build: an asset reference was not inlined");
// شعار المحل داخل الملف نفسه (يعمل بدون إنترنت وفي النسخة ذات الملف الواحد)
const LOGO = "data:image/png;base64," + fs.readFileSync(path.join(root, "brand", "logo-997-ui.png")).toString("base64");
html = html.split("__LOGO_997__").join(LOGO);

const out = path.join(root, "laundry-997-full.html");
fs.writeFileSync(out, html);
// نسخة باسم index.html ليفتحها رابط الموقع (GitHub Pages) مباشرة من الجوال
fs.writeFileSync(path.join(root, "index.html"), html);
// صفحة الإيصال العامة التي يفتحها العميل من رابط واتساب (r.html?t=…)
let rp = src("r.html").replace(/    <script src="([\w.-]+)"><\/script>/g, (_, f) => "    <script>\n" + src(f) + "\n</script>");
if (/<script src=/.test(rp)) throw new Error("build: r.html asset not inlined");
fs.writeFileSync(path.join(root, "r.html"), rp.split("__LOGO_997__").join(LOGO));
// ملفات التطبيق على الجوال (العمل بدون إنترنت + الأيقونة) تُنسخ بجانب index.html
for (const f of fs.readdirSync(path.join(root, "src", "pwa"))) fs.copyFileSync(path.join(root, "src", "pwa", f), path.join(root, f));
// أسماء الأصناف (عربي/إنجليزي) داخل دالة مساعد واتساب — من نفس قائمة النظام حتى لا تختلف الأسماء أبداً
{
  const app = src("app.js");
  const ids = [...app.slice(app.indexOf("const CLOTHING_DEFAULT = ["), app.indexOf("];", app.indexOf("const CLOTHING_DEFAULT = ["))).matchAll(/id: "([a-z0-9_]+)", key: "(cloth_[a-z0-9_]+)"/g)];
  const ar = {}, en = {};
  for (const m of app.matchAll(/(cloth_[a-z0-9_]+): "([^"]+)"/g)) { if (!(m[1] in ar)) ar[m[1]] = m[2]; else if (!(m[1] in en)) en[m[1]] = m[2]; }
  const cat = {}; ids.forEach(([, id, key]) => { cat[id] = [ar[key] || id, en[key] || id]; });
  const fn = path.join(root, "supabase", "functions", "whatsapp-bot", "index.ts");
  const code = fs.readFileSync(fn, "utf8");
  const next = code.replace(/\/\/ @@CATALOG_START\n[\s\S]*?\/\/ @@CATALOG_END/, `// @@CATALOG_START\nconst CATALOG = ${JSON.stringify(cat)};\n// @@CATALOG_END`);
  if (Object.keys(cat).length < 40) throw new Error("build: garment catalog for the WhatsApp bot looks wrong");
  if (next !== code) fs.writeFileSync(fn, next);
}
console.log(`built ${path.relative(root, out)} (${(html.length / 1024).toFixed(0)} KB)`);
