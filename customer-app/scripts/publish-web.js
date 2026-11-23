// Copies the web build (dist/) to the shop site at /app/ (the repo root's app/ folder, served by GitHub Pages),
// adds the install-to-home-screen tags, and writes the site's 404.html so links like /app/orders open the app.
// Usage (from customer-app/): npm run publish:web   (= expo export + this script). Then commit and push as usual.
const fs = require("fs"), path = require("path");
const dist = path.join(__dirname, "..", "dist"), site = path.join(__dirname, "..", ".."), out = path.join(site, "app");
if (!fs.existsSync(path.join(dist, "index.html"))) { console.error("run `npx expo export --platform web --output-dir dist` first"); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });
const head = [
  '<link rel="manifest" href="/app/manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="/app/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="مغسلة 997">',
  '<meta name="description" content="مغسلة 997 — تابع طلباتك وباقتك واحجز الاستلام من البيت">',
].join("\n");
let html = fs.readFileSync(path.join(out, "index.html"), "utf8").replace("</head>", `${head}\n</head>`);
fs.writeFileSync(path.join(out, "index.html"), html);
// GitHub Pages serves 404.html for unknown paths: inside /app/ that is the app itself (it reads the path and opens
// the right screen); anywhere else it goes back to the management system's home page.
const guard = '<script>if(!/^\\/app(\\/|$)/.test(location.pathname)){location.replace("/");}</script>';
fs.writeFileSync(path.join(site, "404.html"), html.replace("<head>", `<head>\n${guard}`));
console.log(`published the customer app to ${path.relative(site, out)}/ (${fs.readdirSync(out).length} entries) + 404.html`);
