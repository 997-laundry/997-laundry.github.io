// Local stand-in for the small part of Supabase the app uses, for browser tests only.
// Auth (/auth/v1: signup, password + refresh-token sign-in, change password) and the REST API
// (/rest/v1: select / insert / update with eq|gt|gte filters, order, limit, rpc) run against a REAL local
// PostgreSQL database that has supabase/setup.sql applied, with every request executed as role
// "authenticated" and the signed-in user's id — so the real Row Level Security rules decide each answer.
// Final verification still happens against the real Supabase project.
//
// Usage: const s = await startStandin({ database: "l997_e2e" }); ... s.url ... await s.close();
const http = require("http");
const path = require("path");

const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { Pool, types } = require("pg");
types.setTypeParser(20, Number); // bigint → JSON number, as PostgREST returns it

const IDENT = /^[a-z_][a-z0-9_]*$/;
const pgAdmin = (args) => execFileSync("su", ["postgres", "-c", args], { stdio: "pipe" }).toString();

async function startStandin(opts = {}) {
  const db = opts.database || "l997_e2e_" + process.pid;
  const root = path.join(__dirname, "..", "supabase");
  // fresh database with the real setup script
  try { pgAdmin(`dropdb --if-exists ${db}`); } catch (e) { /* first run */ }
  pgAdmin(`createdb ${db}`);
  for (const f of [path.join(root, "test", "auth_stub.sql"), path.join(root, "setup.sql")]) {
    pgAdmin(`psql -X -q -v ON_ERROR_STOP=1 -d ${db} -f ${f} >/dev/null 2>&1`);
  }
  if (opts.owner !== false) pgAdmin(`psql -X -q -d ${db} -c "insert into public.shop_setup (id, owner_email) values (1, '${opts.owner || "owner"}@997laundry.app')"`);
  pgAdmin(`psql -X -q -d ${db} -c "do \\$\\$ begin if not exists (select 1 from pg_roles where rolname='l997_standin') then create role l997_standin login password 'standin' in role authenticated, anon; end if; end \\$\\$; grant authenticated, anon to l997_standin; alter role l997_standin bypassrls; grant select, insert, update on auth.users to l997_standin; grant usage on schema extensions to l997_standin;"`);
  const pool = new Pool({ host: "127.0.0.1", user: "l997_standin", password: "standin", database: db, max: 8 });
  const sessions = new Map(); // token -> user id
  const refresh = new Map();  // refresh token -> user id
  let requests = 0, offline = false;

  const issue = (user) => {
    const access = crypto.randomBytes(24).toString("hex"), rt = crypto.randomBytes(24).toString("hex");
    sessions.set(access, user.id); refresh.set(rt, user.id);
    return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: rt, user: { id: user.id, email: user.email } };
  };
  async function asUser(uid, fn) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(uid ? "set local role authenticated" : "set local role anon");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid || ""]);
      const r = await fn(c);
      await c.query("commit");
      return r;
    } catch (e) { await c.query("rollback").catch(() => {}); throw e; } finally { c.release(); }
  }
  const pgStatus = (e) => (e.code === "42501" ? 403 : e.code === "23505" ? 409 : 400);

  function parseFilters(params) {
    const where = [], vals = [];
    for (const [k, v] of params) {
      if (["select", "order", "limit", "on_conflict"].includes(k)) continue;
      if (!IDENT.test(k)) throw Object.assign(new Error("bad column"), { status: 400 });
      const m = /^(eq|gt|gte|lt|lte|neq)\.(.*)$/s.exec(v);
      if (!m) throw Object.assign(new Error("bad filter " + v), { status: 400 });
      const op = { eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=", neq: "<>" }[m[1]];
      vals.push(m[2]); where.push(`${k} ${op} $${vals.length}`);
    }
    return { where, vals };
  }
  function orderLimit(params) {
    let sql = "";
    if (params.get("order")) {
      const parts = params.get("order").split(",").map((p) => { const [c, d] = p.split("."); if (!IDENT.test(c)) throw new Error("bad order"); return `${c} ${d === "desc" ? "desc" : "asc"}`; });
      sql += " order by " + parts.join(", ");
    }
    if (params.get("limit")) sql += " limit " + Math.min(1000, parseInt(params.get("limit"), 10) || 1000);
    return sql;
  }

  const server = http.createServer(async (req, res) => {
    requests++;
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,OPTIONS" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204);
    if (offline) { req.socket.destroy(); return; }
    if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs)); // like a far-away real server
    let raw = "";
    try { for await (const chunk of req) raw += chunk; } catch (e) { return; } // browser closed mid-request
    const body = raw ? JSON.parse(raw) : null;
    const u = new URL(req.url, "http://x");
    if (!req.headers.apikey) return send(401, { message: "No API key found in request" });
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const uid = sessions.get(bearer) || null;
    try {
      // ---------- auth ----------
      if (u.pathname === "/auth/v1/signup" && req.method === "POST") {
        const email = String(body.email || "").toLowerCase();
        const exists = await pool.query("select 1 from auth.users where email = $1", [email]);
        if (exists.rowCount) return send(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
        if (String(body.password || "").length < 6) return send(422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
        const id = crypto.randomUUID();
        await pool.query("insert into auth.users (id, email, encrypted_password) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')))", [id, email, body.password]);
        return send(200, issue({ id, email }));
      }
      if (u.pathname === "/auth/v1/token" && req.method === "POST") {
        if (u.searchParams.get("grant_type") === "password") {
          const r = await pool.query("select id, email from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [String(body.email || "").toLowerCase(), body.password || ""]);
          if (!r.rowCount) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
          return send(200, issue(r.rows[0]));
        }
        if (u.searchParams.get("grant_type") === "refresh_token") {
          const id = refresh.get(body.refresh_token);
          if (!id) return send(400, { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" });
          refresh.delete(body.refresh_token);
          const r = await pool.query("select id, email from auth.users where id = $1", [id]);
          return send(200, issue(r.rows[0]));
        }
      }
      if (u.pathname === "/auth/v1/user" && req.method === "PUT") {
        if (!uid) return send(401, { code: 401, msg: "invalid JWT" });
        await pool.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where id = $1", [uid, body.password]);
        return send(200, { id: uid });
      }
      // ---------- rest ----------
      const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)$/.exec(u.pathname);
      if (!m) return send(404, { message: "not found" });
      const name = m[2];
      if (m[1]) {
        const args = Object.keys(body || {});
        if (!args.every((a) => IDENT.test(a))) return send(400, { message: "bad args" });
        const sql = `select public.${name}(${args.map((a, i) => `${a} => $${i + 1}`).join(", ")}) as r`;
        const r = await asUser(uid, (c) => c.query(sql, args.map((a) => (body[a] !== null && typeof body[a] === "object" ? JSON.stringify(body[a]) : body[a]))));
        return send(200, r.rows[0].r);
      }
      const { where, vals } = parseFilters(u.searchParams);
      const wsql = where.length ? " where " + where.join(" and ") : "";
      if (req.method === "GET") {
        const r = await asUser(uid, (c) => c.query(`select * from public.${name}${wsql}${orderLimit(u.searchParams)}`, vals));
        return send(200, r.rows);
      }
      if (req.method === "POST") {
        const rows = Array.isArray(body) ? body : [body];
        const out = await asUser(uid, async (c) => {
          const acc = [];
          for (const row of rows) {
            const cols = Object.keys(row); if (!cols.every((x) => IDENT.test(x))) throw new Error("bad column");
            const r = await c.query(`insert into public.${name} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning *`, cols.map((x) => (row[x] !== null && typeof row[x] === "object" ? JSON.stringify(row[x]) : row[x])));
            acc.push(r.rows[0]);
          }
          return acc;
        });
        return send(201, /return=representation/.test(req.headers.prefer || "") ? out : undefined);
      }
      if (req.method === "PATCH") {
        const cols = Object.keys(body); if (!cols.every((x) => IDENT.test(x))) return send(400, { message: "bad column" });
        const set = cols.map((x, i) => `${x} = $${vals.length + i + 1}`).join(", ");
        const r = await asUser(uid, (c) => c.query(`update public.${name} set ${set}${wsql} returning *`, [...vals, ...cols.map((x) => (body[x] !== null && typeof body[x] === "object" ? JSON.stringify(body[x]) : body[x]))]));
        return send(200, /return=representation/.test(req.headers.prefer || "") ? r.rows : undefined);
      }
      return send(405, { message: "method not allowed" });
    } catch (e) {
      return send(e.status || pgStatus(e), { code: e.code || "", message: e.message });
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    db,
    get requests() { return requests; },
    setOffline(v) { offline = !!v; },
    // test inspection only: runs as the stand-in's own login (bypasses RLS); app requests always switch to "authenticated"
    query: (sql, params) => pool.query(sql, params),
    async close() { server.close(); await pool.end(); try { pgAdmin(`dropdb --if-exists ${db}`); } catch (e) { /* ignore */ } },
  };
}
module.exports = { startStandin };
if (require.main === module) startStandin().then((s) => console.log("stand-in at", s.url, "db", s.db));

