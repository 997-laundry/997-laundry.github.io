// 997 Laundry — send the receipt image to the customer through the official WhatsApp Business (Cloud) API.
// Deploy: Supabase → Edge Functions → "Deploy a new function" → name: whatsapp-send → paste this file → Deploy.
// Secrets (Supabase → Edge Functions → Secrets):
//   WA_TOKEN      permanent access token of the Meta "system user" (never put it in the app)
//   WA_PHONE_ID   "Phone number ID" from Meta → WhatsApp → API Setup
//   WA_TEMPLATE   approved template name (default: order_delivered) — header: IMAGE, body: {{1}} name, {{2}} order no., {{3}} payment line
//   WA_LANG       template language code (default: ar)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Only signed-in members of the shop can call it. The app sends: { to, name, orderNo, line, image (PNG, base64) }.
// { ping: true } only reports whether the WhatsApp secrets are set.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const clean = (s, max) => String(s == null ? "" : s).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

export async function handle(req, env, fetchImpl) {
  const f = fetchImpl || fetch;
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });
  const base = env.SUPABASE_URL, svc = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !svc) return json(500, { error: "server not configured" });

  // 1) caller must be a signed-in member of the shop
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/.test(auth)) return json(401, { error: "sign in first" });
  const u = await f(`${base}/auth/v1/user`, { headers: { apikey: svc, Authorization: auth } });
  if (!u.ok) return json(401, { error: "sign in first" });
  const user = await u.json().catch(() => null);
  if (!user || !user.id) return json(401, { error: "sign in first" });
  const m = await f(`${base}/rest/v1/shop_members?user_id=eq.${encodeURIComponent(user.id)}&select=role&limit=1`, { headers: { apikey: svc, Authorization: `Bearer ${svc}` } });
  const rows = m.ok ? await m.json().catch(() => []) : [];
  if (!Array.isArray(rows) || !rows.length) return json(403, { error: "not a member of the shop" });

  let body = null;
  try { body = await req.json(); } catch (e) { return json(400, { error: "bad request" }); }
  const configured = !!(env.WA_TOKEN && env.WA_PHONE_ID);
  if (body && body.ping) return json(200, { ok: true, configured, template: env.WA_TEMPLATE || "order_delivered", lang: env.WA_LANG || "ar" });
  if (!configured) return json(503, { error: "whatsapp not configured" });

  // 2) check the input
  const to = String(body.to || "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(to)) return json(400, { error: "bad phone number" });
  const name = clean(body.name, 60) || "-", orderNo = clean(body.orderNo, 20) || "-", line = clean(body.line, 120) || "-";
  const b64 = String(body.image || "").replace(/^data:image\/png;base64,/, "");
  let bytes;
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch (e) { return json(400, { error: "bad image" }); }
  if (bytes.length < 100 || bytes.length > 4_500_000 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return json(400, { error: "bad image" });

  // 3) upload the image to WhatsApp, then send the approved template with it as the header
  const ver = env.WA_API_VERSION || "v21.0", g = `https://graph.facebook.com/${ver}/${env.WA_PHONE_ID}`;
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "image/png");
  fd.append("file", new Blob([bytes], { type: "image/png" }), `receipt-${orderNo}.png`);
  const up = await f(`${g}/media`, { method: "POST", headers: { Authorization: `Bearer ${env.WA_TOKEN}` }, body: fd });
  const upj = await up.json().catch(() => ({}));
  if (!up.ok || !upj.id) return json(502, { error: "image upload failed", detail: (upj.error && upj.error.message) || up.status });
  const msg = {
    messaging_product: "whatsapp", to, type: "template",
    template: {
      name: env.WA_TEMPLATE || "order_delivered", language: { code: env.WA_LANG || "ar" },
      components: [
        { type: "header", parameters: [{ type: "image", image: { id: upj.id } }] },
        { type: "body", parameters: [{ type: "text", text: name }, { type: "text", text: orderNo }, { type: "text", text: line }] },
      ],
    },
  };
  const s = await f(`${g}/messages`, { method: "POST", headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(msg) });
  const sj = await s.json().catch(() => ({}));
  if (!s.ok) return json(502, { error: "send failed", detail: (sj.error && sj.error.message) || s.status });
  return json(200, { ok: true, id: sj.messages && sj.messages[0] ? sj.messages[0].id : null });
}

if (typeof Deno !== "undefined") Deno.serve(async (req) => {
  try { return await handle(req, Deno.env.toObject()); }
  catch (e) { console.error("handler", e && e.message); return json(500, { error: "server error", detail: String((e && e.message) || e).slice(0, 300) }); }
});
