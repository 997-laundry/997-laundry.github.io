// Unit tests for supabase/functions/whatsapp-send (the WhatsApp Business API sender), with Supabase and Meta mocked.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "supabase", "functions", "whatsapp-send", "index.ts"), "utf8");
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "waf-")), "index.mjs");
fs.writeFileSync(tmp, src);
const load = () => import(tmp).then((m) => m.handle);

const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc", WA_TOKEN: "tok", WA_PHONE_ID: "123" };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(400, 1)]).toString("base64");
const req = (body, auth = "Bearer user-jwt") => new Request("https://x.supabase.co/functions/v1/whatsapp-send", { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
function mockFetch({ member = true, user = true, upload = { id: "MEDIA1" }, send = { messages: [{ id: "wamid.1" }] }, sendStatus = 200 } = {}) {
  const calls = [];
  const f = async (url, opt = {}) => {
    calls.push({ url, opt });
    if (url.endsWith("/auth/v1/user")) return new Response(JSON.stringify(user ? { id: "u1" } : {}), { status: user ? 200 : 401 });
    if (url.includes("/rest/v1/shop_members")) return new Response(JSON.stringify(member ? [{ role: "worker" }] : []), { status: 200 });
    if (url.endsWith("/media")) return new Response(JSON.stringify(upload), { status: upload.id ? 200 : 400 });
    if (url.endsWith("/messages")) return new Response(JSON.stringify(send), { status: sendStatus });
    return new Response("{}", { status: 404 });
  };
  return { f, calls };
}

test("refuses callers who are not signed in", async () => {
  const handle = await load(); const m = mockFetch();
  assert.equal((await handle(req({ ping: true }, ""), ENV, m.f)).status, 401);
  assert.equal((await handle(req({ ping: true }), ENV, mockFetch({ user: false }).f)).status, 401);
});
test("refuses signed-in users who are not members of the shop", async () => {
  const handle = await load();
  assert.equal((await handle(req({ ping: true }), ENV, mockFetch({ member: false }).f)).status, 403);
});
test("ping reports whether the WhatsApp secrets are set (without sending anything)", async () => {
  const handle = await load(); const m = mockFetch();
  const r = await (await handle(req({ ping: true }), ENV, m.f)).json();
  assert.equal(r.configured, true); assert.equal(r.template, "order_delivered");
  assert.ok(!m.calls.some((c) => /graph\.facebook/.test(c.url)));
  const r2 = await (await handle(req({ ping: true }), { ...ENV, WA_TOKEN: "" }, mockFetch().f)).json();
  assert.equal(r2.configured, false);
});
test("sends: uploads the PNG, then the template with the image header and 3 body values", async () => {
  const handle = await load(); const m = mockFetch();
  const res = await handle(req({ to: "+973 3344 5566", name: "Ali", orderNo: "00011", line: "المتبقي: 1.750 د.ب", image: PNG }), { ...ENV, WA_TEMPLATE: "order_delivered", WA_LANG: "ar" }, m.f);
  const j = await res.json();
  assert.equal(res.status, 200); assert.equal(j.id, "wamid.1");
  const up = m.calls.find((c) => c.url.endsWith("/media"));
  assert.match(up.url, /graph\.facebook\.com\/v\d+\.\d+\/123\/media$/);
  assert.equal(up.opt.headers.Authorization, "Bearer tok");
  const file = up.opt.body.get("file"); assert.equal(file.type, "image/png"); assert.ok(file.size > 100);
  const sent = JSON.parse(m.calls.find((c) => c.url.endsWith("/messages")).opt.body);
  assert.equal(sent.to, "97333445566"); assert.equal(sent.type, "template"); assert.equal(sent.template.name, "order_delivered"); assert.equal(sent.template.language.code, "ar");
  assert.deepEqual(sent.template.components[0], { type: "header", parameters: [{ type: "image", image: { id: "MEDIA1" } }] });
  assert.deepEqual(sent.template.components[1].parameters.map((p) => p.text), ["Ali", "00011", "المتبقي: 1.750 د.ب"]);
});
test("never sends empty template values (Meta rejects them) and strips line breaks", async () => {
  const handle = await load(); const m = mockFetch();
  await handle(req({ to: "97333445566", name: "", orderNo: "1", line: "a\nb", image: PNG }), ENV, m.f);
  const sent = JSON.parse(m.calls.find((c) => c.url.endsWith("/messages")).opt.body);
  assert.deepEqual(sent.template.components[1].parameters.map((p) => p.text), ["-", "1", "a b"]);
});
test("rejects a bad phone number or a non-PNG image", async () => {
  const handle = await load();
  assert.equal((await handle(req({ to: "12", image: PNG }), ENV, mockFetch().f)).status, 400);
  assert.equal((await handle(req({ to: "97333445566", image: Buffer.from("hello world, not an image at all...".repeat(5)).toString("base64") }), ENV, mockFetch().f)).status, 400);
});
test("not configured yet → 503 (the app falls back to the manual way)", async () => {
  const handle = await load();
  assert.equal((await handle(req({ to: "97333445566", image: PNG }), { ...ENV, WA_PHONE_ID: "" }, mockFetch().f)).status, 503);
});
test("Meta errors are reported back (502 with Meta's message)", async () => {
  const handle = await load();
  const r = await handle(req({ to: "97333445566", image: PNG }), ENV, mockFetch({ send: { error: { message: "Template name does not exist" } }, sendStatus: 400 }).f);
  assert.equal(r.status, 502); assert.match((await r.json()).detail, /Template name/);
});
test("answers the browser's CORS pre-check", async () => {
  const handle = await load();
  const r = await handle(new Request("https://x/functions/v1/whatsapp-send", { method: "OPTIONS" }), ENV, mockFetch().f);
  assert.equal(r.status, 200); assert.match(r.headers.get("access-control-allow-headers"), /authorization/);
});
