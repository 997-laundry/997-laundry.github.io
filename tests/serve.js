// Serves one built HTML file (plus its icons/manifest) over http://127.0.0.1 for the browser tests.
// Pages opened as file:// in headless Chromium can lose their storage on reload, which made suites fail at random;
// the real app is always opened from a web address. sw.js is replaced by an empty worker so the offline layer
// (tested separately in e2e.offline.js) does not cache pages between steps.
const http = require("http");
const fs = require("fs");
const path = require("path");

const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };

module.exports = function serve(file) {
  const dir = path.dirname(file), name = path.basename(file);
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let f = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || name;
      if (f === "favicon.ico") { res.writeHead(204); return res.end(); }
      if (f === "sw.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end("// tests: no offline caching\n"); }
      if (f.includes("..")) { res.writeHead(404); return res.end(); }
      fs.readFile(path.join(dir, f), (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" });
        res.end(data);
      });
    });
    srv.listen(0, "127.0.0.1", () => { srv.unref(); resolve(`http://127.0.0.1:${srv.address().port}/${name}`); });
  });
};
