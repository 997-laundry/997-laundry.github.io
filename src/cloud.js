/* ==========================================================================
   997 Laundry — cloud.js
   مزامنة سحابية مع Supabase: كل جهاز يحفظ بياناته محلياً كما هو (يعمل بدون إنترنت)،
   وهذا الملف يرفع كل تغيير للسحابة ويسحب تغييرات الأجهزة الأخرى.

   - كل سجل (طلب، عميل، مصروف...) = صف في جدول records، مع رقم نسخة (version):
     التعديل يُقبل فقط إذا لم يغيّره جهاز آخر قبلنا — وإلا تفوز نسخة السحابة وتُحفظ نسختنا في «تعارضات».
   - تغييرات الأجهزة الأخرى تُطبَّق فقط عندما يكون الجهاز خاملاً (لا نافذة مفتوحة ولا سلة) ثم تُعاد تهيئة الصفحة،
     حتى لا تكتب الشاشة المفتوحة بيانات قديمة فوق الجديدة.
   - كلمات المرور المجزّأة ورمز الاسترداد لا تغادر الجهاز أبداً.
   - لا يعمل شيء من هذا قبل أن يربط المالك النظام بالسحابة (زر في «ملف المنشأة»).
   ========================================================================== */
(function (root) {
  "use strict";
  const CFG = Object.assign({
    url: "https://szlfvwzuyllitqkdysju.supabase.co",
    key: "sb_publishable_UrGITH1hX1-Ds8fA0eHPew_vMFzFkdS",
    pollMs: 4000, idleMs: 8000, softIdleMs: 1500, emailDomain: "997laundry.app",
  }, root.__L997_CLOUD_CONFIG || {});

  // [اسم المجموعة في السحابة, مفتاح التخزين المحلي, نوعها, خيارات]
  // list = مصفوفة سجلات لكل منها id · doc = كائن واحد · local = حقول لا تُرفع · keepRemoved = لا تُحذف من السحابة عند قصّها محلياً
  const COLLECTIONS = [
    ["orders", "l997_orders", "list"], ["customers", "l997_customers", "list"], ["ledger", "l997_ledger", "list"],
    ["customer_packages", "l997_customer_packages", "list"], ["suspended_orders", "l997_suspended_orders", "list"],
    ["shifts", "l997_shifts", "list"], ["attendance", "l997_attendance", "list"],
    ["audit", "l997_audit", "list", { keepRemoved: true }],
    ["settings", "l997_settings", "doc", { local: ["orderSeq"], defaults: { orderSeq: 1 } }],
    ["custom_garments", "l997_custom_garments", "list"], ["profile", "l997_profile", "doc"],
    ["branches", "l997_branches", "doc"], ["perm_matrix", "l997_perm_matrix", "doc"],
    ["security", "l997_security", "doc", { local: ["recoveryHash", "recoverySalt", "recoveryAt"] }],
    ["employees", "l997_employees", "list", { local: ["passHash", "salt", "password"] }],
    ["payroll", "l997_payroll", "list"], ["expenses", "l997_expenses", "list"],
    ["recurring_expenses", "l997_recurring_expenses", "list"], ["inventory", "l997_inventory", "list"],
    ["purchases", "l997_purchases", "list"], ["suppliers", "l997_suppliers", "list"],
    ["stock_moves", "l997_stock_moves", "list", { keepRemoved: true }], ["closures", "l997_closures", "list"],
  ].map(([name, key, type, o]) => ({ name, key, type, local: [], defaults: {}, keepRemoved: false, ...(o || {}) }));
  const byKey = {}, byName = {};
  COLLECTIONS.forEach((c) => { byKey[c.key] = c; byName[c.name] = c; });

  const ST_KEY = "l997_cloud", BASE_KEY = "l997_cloud_base", TOK_KEY = "l997_cloud_tokens";
  let ls = null;
  try { ls = root.localStorage; ls.getItem("l997_cloud"); } catch (e) { ls = null; }
  const rawSet = typeof Storage !== "undefined" ? Storage.prototype.setItem : null;
  const read = (k, d) => { try { const v = ls.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
  const write = (k, v) => { try { rawSet.call(ls, k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  let st = ls ? read(ST_KEY, null) : null; // { shopId, cursor, numbers, rules, conflicts, rejected, lastSyncAt, lastError }
  let base = ls ? read(BASE_KEY, {}) : {}; // collection → record id → [version, hash]
  let tokens = ls ? read(TOK_KEY, {}) : {}; // cloud user id → { a, r, exp }
  let user = null; // { uid, role }
  let applying = false, busy = false, timer = null, debounce = null, needLogin = false, online = true;
  let lastInput = Date.now(), lastError = "", staged = new Map(), stagedCursor = 0;
  const dirty = new Set();
  const saveSt = () => { if (st) write(ST_KEY, st); };
  const saveBase = () => write(BASE_KEY, base);
  const saveTok = () => write(TOK_KEY, tokens);

  /* ---------- اكتشاف التغييرات المحلية ---------- */
  if (ls && rawSet) {
    Storage.prototype.setItem = function (k, v) {
      rawSet.call(this, k, v);
      if (this === ls && !applying && st && byKey[k]) { dirty.add(k); schedulePush(); }
    };
  }
  if (typeof document !== "undefined") {
    ["pointerdown", "keydown", "touchstart", "input"].forEach((ev) => document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  }

  // نص ثابت للمقارنة (ترتيب المفاتيح لا يؤثر — قاعدة البيانات تعيد ترتيبها)
  function canon(v) {
    if (v === null || typeof v !== "object") { const s = JSON.stringify(v); return s === undefined ? "null" : s; }
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    return "{" + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  function hashOf(v) {
    const s = canon(v);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + "." + s.length.toString(36);
  }
  function strip(c, d) {
    if (!c.local.length || !d || typeof d !== "object" || Array.isArray(d)) return d;
    const o = { ...d }; c.local.forEach((k) => delete o[k]); return o;
  }
  function pickLocal(c, d) {
    const o = {};
    if (d && typeof d === "object") c.local.forEach((k) => { if (d[k] !== undefined) o[k] = d[k]; });
    return o;
  }
  function localRecords(c) {
    const v = read(c.key, null), m = new Map();
    if (v === null) return m;
    if (c.type === "doc") { m.set("_", strip(c, v)); return m; }
    if (Array.isArray(v)) v.forEach((r) => { if (r && r.id !== undefined && r.id !== null) m.set(String(r.id), strip(c, r)); });
    return m;
  }

  /* ---------- الاتصال ---------- */
  const emailOf = (username) => String(username || "").trim().toLowerCase() + "@" + CFG.emailDomain;
  async function api(path, opt) {
    opt = opt || {};
    const h = { apikey: CFG.key, "Content-Type": "application/json", ...(opt.headers || {}) };
    if (opt.auth !== false) { const t = await accessToken(opt.as); if (!t) throw Object.assign(new Error("no-session"), { noSession: true }); h.Authorization = "Bearer " + t; }
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const to = ctl ? setTimeout(() => ctl.abort(), 15000) : null;
    let r;
    try { r = await root.fetch(CFG.url + path, { method: opt.method || "GET", headers: h, body: opt.body === undefined ? undefined : JSON.stringify(opt.body), signal: ctl ? ctl.signal : undefined }); }
    catch (e) { online = false; throw Object.assign(new Error("offline"), { offline: true }); }
    finally { if (to) clearTimeout(to); }
    online = true;
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!r.ok) throw Object.assign(new Error((data && (data.msg || data.message || data.error_description)) || "HTTP " + r.status), { status: r.status, data });
    return data;
  }
  const rep = { Prefer: "return=representation" };
  function keepSession(s) {
    if (!s || !s.access_token || !s.user) return null;
    tokens[s.user.id] = { a: s.access_token, r: s.refresh_token, exp: Date.now() + (Number(s.expires_in) || 3600) * 1000 };
    saveTok();
    return s.user.id;
  }
  async function accessToken(asUid) {
    const uid = asUid || (user && user.uid);
    if (!uid) return null;
    const t = tokens[uid];
    if (!t) { if (!asUid) needLogin = true; return null; }
    if (Date.now() < t.exp - 60000) return t.a;
    try {
      const s = await api("/auth/v1/token?grant_type=refresh_token", { method: "POST", auth: false, body: { refresh_token: t.r } });
      keepSession(s); if (!asUid) needLogin = false;
      return tokens[uid].a;
    } catch (e) {
      if (e.offline) throw e;
      delete tokens[uid]; saveTok(); if (!asUid) needLogin = true;
      return null;
    }
  }
  const msgOf = (e) => (e.offline ? "offline" : e.status === 400 || e.status === 401 ? "bad-credentials" : e.message || "error");

  /* ---------- رفع التغييرات ---------- */
  // مجموعة يكتب فيها الدور ولا يقرأها (مثل سجل النشاط للعامل) — تُضاف عبر دالة الإضافة فقط
  const canRead = (c) => !st || !st.rules || !st.rules[c.name] || (user && st.rules[c.name].r.includes(user.role));
  const retried = new Set(); // سجلات رُفضت سابقاً — تُعاد محاولتها مرة واحدة في كل فتح للنظام
  const canWrite = (c) => !st || !st.rules || !st.rules[c.name] || (user && st.rules[c.name].w.includes(user.role));
  function note(list, item, max) { st[list] = [item, ...(st[list] || [])].slice(0, max || 40); }
  async function serverRow(c, rid) {
    const rows = await api(`/rest/v1/records?shop_id=eq.${st.shopId}&collection=eq.${c.name}&record_id=eq.${encodeURIComponent(rid)}`);
    return rows && rows[0] ? rows[0] : null;
  }
  function conflict(c, rid, localData, row) {
    note("conflicts", { at: new Date().toISOString(), collection: c.name, id: rid, mine: canon(localData).slice(0, 4000) });
    if (row) { staged.set(c.name + "\u0000" + rid, row); stagedCursor = Math.max(stagedCursor, st.cursor || 0); }
  }
  async function pushCollection(c) {
    const recs = localRecords(c), b = base[c.name] || (base[c.name] = {});
    const inserts = [], updates = [], removes = [];
    const readable = canRead(c);
    recs.forEach((d, rid) => {
      const h = hashOf(d), bb = b[rid], key = c.name + "\u0000" + rid;
      if (!bb || (bb[0] === 0 && !retried.has(key))) { retried.add(key); inserts.push([rid, d, h]); }
      else if (bb[1] !== h) { if (readable) updates.push([rid, d, h, bb[0]]); else bb[1] = h; } // لا تعديل لما لا نقرؤه
    });
    if (!c.keepRemoved && readable) Object.keys(b).forEach((rid) => { if (!recs.has(rid) && b[rid][0] > 0) removes.push([rid, b[rid][0]]); });
    if (!readable) {
      for (let i = 0; i < inserts.length; i += 100) {
        const chunk = inserts.slice(i, i + 100);
        try {
          await api("/rest/v1/rpc/append_records", { method: "POST", body: { p_shop: st.shopId, p_collection: c.name, p_items: chunk.map(([rid, d]) => ({ id: rid, data: d })) } });
          chunk.forEach(([rid, , h]) => { b[rid] = [1, h]; });
        } catch (e) {
          if (e.offline || e.noSession) throw e;
          note("rejected", { at: new Date().toISOString(), collection: c.name, id: chunk[0][0], why: e.message });
          chunk.forEach(([rid, , h]) => { b[rid] = [0, h]; });
        }
      }
      return;
    }
    for (let i = 0; i < inserts.length; i += 100) {
      const chunk = inserts.slice(i, i + 100);
      try {
        const rows = await api("/rest/v1/records", { method: "POST", headers: rep, body: chunk.map(([rid, d]) => ({ shop_id: st.shopId, collection: c.name, record_id: rid, data: d })) });
        rows.forEach((row) => { const it = chunk.find((x) => x[0] === row.record_id); b[row.record_id] = [row.version, it ? it[2] : hashOf(row.data)]; });
      } catch (e) {
        if (e.offline || e.noSession) throw e;
        // دفعة رُفضت: نجرّب كل سجل وحده حتى لا يوقف سجل واحد الباقي
        for (const [rid, d, h] of chunk) {
          try {
            const rows = await api("/rest/v1/records", { method: "POST", headers: rep, body: { shop_id: st.shopId, collection: c.name, record_id: rid, data: d } });
            b[rid] = [rows[0].version, h];
          } catch (e2) {
            if (e2.offline || e2.noSession) throw e2;
            if (e2.status === 409) { conflict(c, rid, d, await serverRow(c, rid)); b[rid] = [0, h]; }
            else { note("rejected", { at: new Date().toISOString(), collection: c.name, id: rid, why: e2.message }); b[rid] = [0, h]; }
          }
        }
      }
    }
    for (const [rid, d, h, v] of updates) {
      try {
        if (v === 0) { // لم يُقبل سابقاً — محاولة إدخال من جديد
          const rows = await api("/rest/v1/records", { method: "POST", headers: rep, body: { shop_id: st.shopId, collection: c.name, record_id: rid, data: d } });
          b[rid] = [rows[0].version, h]; continue;
        }
        const rows = await api(`/rest/v1/records?shop_id=eq.${st.shopId}&collection=eq.${c.name}&record_id=eq.${encodeURIComponent(rid)}&version=eq.${v}`, { method: "PATCH", headers: rep, body: { data: d } });
        if (rows && rows.length) b[rid] = [rows[0].version, h];
        else conflict(c, rid, d, await serverRow(c, rid));
      } catch (e) {
        if (e.offline || e.noSession) throw e;
        note("rejected", { at: new Date().toISOString(), collection: c.name, id: rid, why: e.message });
        b[rid] = [v, h];
      }
    }
    for (const [rid, v] of removes) {
      try {
        const rows = await api(`/rest/v1/records?shop_id=eq.${st.shopId}&collection=eq.${c.name}&record_id=eq.${encodeURIComponent(rid)}&version=eq.${v}`, { method: "PATCH", headers: rep, body: { deleted: true } });
        if (rows && rows.length) delete b[rid];
        else conflict(c, rid, null, await serverRow(c, rid));
      } catch (e) {
        if (e.offline || e.noSession) throw e;
        note("rejected", { at: new Date().toISOString(), collection: c.name, id: rid, why: e.message });
        delete b[rid];
      }
    }
  }
  async function push() {
    const keys = [...dirty];
    for (const k of keys) {
      const c = byKey[k];
      if (!canWrite(c)) continue; // يبقى معلّقاً حتى يدخل مستخدم له صلاحية الكتابة
      dirty.delete(k);
      try { await pushCollection(c); } catch (e) { dirty.add(k); throw e; } finally { saveBase(); saveSt(); }
    }
  }
  function schedulePush() {
    clearTimeout(debounce);
    debounce = setTimeout(() => { sync(false).catch(() => {}); }, 400); // رفع شبه فوري بعد الحفظ
  }

  /* ---------- سحب تغييرات الأجهزة الأخرى ---------- */
  async function pull() {
    let from = Math.max(0, (Math.max(st.cursor || 0, stagedCursor) || 0) - 50); // تداخل بسيط حتى لا تفوتنا عمليات متزامنة
    for (let page = 0; page < 200; page++) {
      const rows = await api(`/rest/v1/records?select=collection,record_id,data,deleted,version,seq&shop_id=eq.${st.shopId}&seq=gt.${from}&order=seq.asc&limit=500`);
      for (const row of rows) {
        const c = byName[row.collection]; if (!c) continue;
        const bb = (base[c.name] || {})[row.record_id];
        stagedCursor = Math.max(stagedCursor, row.seq);
        if (bb && bb[0] >= row.version) continue;
        const k = c.name + "\u0000" + row.record_id, prev = staged.get(k);
        if (!prev || prev.version < row.version) staged.set(k, row);
      }
      if (rows.length < 500) break;
      from = rows[rows.length - 1].seq;
    }
  }
  // تطبيق التغييرات المسحوبة على التخزين المحلي — دفعة واحدة متزامنة قبل إعادة تهيئة الصفحة مباشرة
  function applyStaged(replaceAll) {
    const groups = new Map();
    staged.forEach((row) => { const c = byName[row.collection]; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(row); });
    applying = true;
    try {
      COLLECTIONS.forEach((c) => {
        const rows = groups.get(c) || [];
        if (!rows.length && !replaceAll) return;
        const b = base[c.name] || (base[c.name] = {});
        const cur = replaceAll ? null : read(c.key, null);
        if (c.type === "doc") {
          const row = rows.sort((x, y) => y.version - x.version)[0];
          if (!row) return;
          if (row.deleted) { delete b._; return; }
          if (!replaceAll && cur !== null && b._ && hashOf(strip(c, cur)) !== b._[1]) conflict(c, "_", strip(c, cur), null);
          write(c.key, { ...c.defaults, ...row.data, ...pickLocal(c, cur) });
          b._ = [row.version, hashOf(row.data)];
          return;
        }
        let arr = Array.isArray(cur) ? cur.slice() : [];
        const idx = new Map(arr.map((r, i) => [r && r.id !== undefined ? String(r.id) : "\u0000" + i, r]));
        const fresh = [];
        rows.sort((x, y) => x.seq - y.seq).forEach((row) => {
          const rid = row.record_id, local = idx.get(rid);
          if (local && b[rid] && hashOf(strip(c, local)) !== b[rid][1]) conflict(c, rid, strip(c, local), null); // تعديل محلي لم يُرفع — تفوز السحابة
          if (row.deleted) { idx.delete(rid); delete b[rid]; return; }
          const merged = { ...row.data, ...pickLocal(c, local) };
          if (local) idx.set(rid, merged); else fresh.unshift(merged);
          b[rid] = [row.version, hashOf(row.data)];
        });
        arr = [...fresh, ...idx.values()];
        write(c.key, arr);
      });
      st.cursor = Math.max(st.cursor || 0, stagedCursor);
      staged = new Map();
      saveBase(); saveSt();
    } finally { applying = false; }
  }
  const host = () => root.L997CloudHost || null;
  function idle() {
    const h = host();
    return !!h && !h.busy() && Date.now() - lastInput > CFG.idleMs;
  }
  function reloadNow() {
    const h = host();
    try { sessionStorage.setItem("l997_cloud_page", h ? h.page() : ""); } catch (e) { /* ignore */ }
    applyStaged(false);
    root.location.reload();
  }
  // ما يمكن عرضه فوراً بدون إعادة تحميل الصفحة؛ غيرها (إعدادات، صلاحيات، موظفون…) يحتاج إعادة تهيئة كاملة
  const SOFT = new Set(["orders", "customers", "ledger", "customer_packages", "suspended_orders", "shifts", "attendance", "audit", "expenses"]);
  function maybeApply() {
    if (!staged.size) { showUpdateChip(false); return; }
    const h = host();
    const soft = h && h.refresh && [...staged.values()].every((r) => SOFT.has(r.collection));
    if (soft && !h.busy() && Date.now() - lastInput > CFG.softIdleMs) {
      applyStaged(false);
      try { h.refresh(); } catch (e) { reloadNow(); return; }
      showUpdateChip(false); renderChip();
      return;
    }
    showUpdateChip(true);
    if (idle()) reloadNow();
  }

  /* ---------- حلقة المزامنة ---------- */
  // رفع/سحب واحد فقط في نفس الوقت — تزامن عمليتين كان يرسل نفس السجل مرتين (تعارض وهمي بعد الربط)
  async function lock() { while (busy) await new Promise((r) => setTimeout(r, 200)); busy = true; }
  async function sync(withPull) {
    if (!st || !st.shopId || !user || busy) return;
    busy = true;
    try {
      await push();
      if (withPull !== false) await pull();
      st.lastSyncAt = new Date().toISOString(); lastError = "";
      needLogin = false;
    } catch (e) {
      lastError = msgOf(e);
    } finally {
      busy = false; saveSt(); renderChip();
      if (withPull !== false) maybeApply();
    }
  }
  // أعلى رقم طلب على هذا الجهاز — أول كتلة أرقام من السحابة لا تبدأ تحته
  const localMaxNumber = () => (read("l997_orders", []) || []).reduce((m, o) => Math.max(m, Number(o && o.number) || 0), 0);
  function start() {
    stop();
    // ما تغيّر محلياً ولم يُرفع قبل إعادة تحميل الصفحة (مثلاً بدون إنترنت) — الرفع يقارن بالنسخ المرفوعة فلا يُرسل إلا المختلف
    if (st && st.shopId) storeDirtyAll();
    sync(true);
    // حجز أرقام الطلبات فور الدخول إن لم يكن لدينا أرقام (لا ننتظر أول طلب، ولا نحجز من جديد مع كل تحديث للصفحة)
    if (st && !((st.numbers && st.numbers[0] <= st.numbers[1]) || st.nextBlock)) refillNumbers(localMaxNumber() + 1);
    timer = setInterval(() => { if (typeof document === "undefined" || !document.hidden) sync(true); }, CFG.pollMs);
  }
  function stop() { clearInterval(timer); timer = null; }
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => sync(true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(true); });
  }

  /* ---------- مؤشرات صغيرة على الشاشة ---------- */
  function chipEl(id, css) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement("button"); el.type = "button"; el.id = id; el.style.cssText = css; document.body.appendChild(el); }
    return el;
  }
  function renderChip() {
    if (typeof document === "undefined" || !document.body) return;
    const el = chipEl("cloudChip", "position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));inset-inline-start:10px;z-index:60;border:0;border-radius:999px;padding:6px 12px;font:700 12px Tajawal,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer");
    if (!st || !user) { el.style.display = "none"; return; }
    const s = status();
    const [txt, bg, fg] = s.needLogin ? ["☁ سجّل الدخول للمزامنة", "#fbf0e0", "#a86411"]
      : !s.online ? ["☁ بدون إنترنت — سيُرفع لاحقاً", "#fbf0e0", "#a86411"]
      : s.pending ? ["☁ جاري المزامنة…", "#e3f1f7", "#1f7ea8"]
      : s.conflicts || s.rejected ? ["☁ متزامن — يحتاج مراجعة", "#fbf0e0", "#a86411"]
      : ["☁ متزامن ✓", "#e2f3eb", "#1f7a55"];
    el.textContent = txt; el.style.background = bg; el.style.color = fg; el.style.display = "";
    el.onclick = () => { const h = host(); if (h && h.openCloudPanel) h.openCloudPanel(); };
  }
  function showUpdateChip(on) {
    if (typeof document === "undefined" || !document.body) return;
    const el = chipEl("cloudUpdateChip", "position:fixed;bottom:calc(52px + env(safe-area-inset-bottom,0px));inset-inline-start:10px;z-index:61;border:0;border-radius:12px;padding:10px 14px;font:800 13px Tajawal,system-ui,sans-serif;background:#1f7ea8;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer");
    el.textContent = "🔄 تحديثات من جهاز آخر — اضغط للتحديث";
    el.style.display = on ? "" : "none";
    el.onclick = () => { const h = host(); if (h && h.busy() && !confirm("أكمل أو احفظ عملك المفتوح أولاً. التحديث الآن يغلق النوافذ المفتوحة. متابعة؟")) return; reloadNow(); };
  }

  /* ---------- واجهة للنظام ---------- */
  async function loadRules() {
    const rows = await api("/rest/v1/collection_rules");
    st.rules = {}; rows.forEach((r) => { st.rules[r.collection] = { r: r.read_roles, w: r.write_roles }; });
  }
  async function membership(uid) {
    const rows = await api(`/rest/v1/shop_members?select=shop_id,role,active,employee_id,display_name&user_id=eq.${uid}`);
    return rows && rows[0] ? rows[0] : null;
  }
  async function signInRaw(username, password) {
    try {
      const s = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email: emailOf(username), password } });
      return { uid: keepSession(s) };
    } catch (e) { return { error: msgOf(e) }; }
  }
  function storeDirtyAll() { COLLECTIONS.forEach((c) => { if (ls.getItem(c.key) !== null) dirty.add(c.key); }); }

  const api997 = {
    collections: COLLECTIONS.map((c) => c.name),
    isLinked: () => !!(st && st.shopId),
    emailOf,
    // تسجيل دخول الموظف في السحابة (قبل الدخول المحلي). offline → يكمل النظام بالدخول المحلي فقط
    async signIn(username, password) { return signInRaw(username, password); },
    // تحقق فقط من كلمة مرور شخص آخر (موافقة مشرف على جهاز موظف): لا تُحفظ جلسته، وتُنهى فوراً
    async verifyPassword(username, password) {
      try {
        const s = await api("/auth/v1/token?grant_type=password", { method: "POST", auth: false, body: { email: emailOf(username), password } });
        if (s && s.access_token) root.fetch(CFG.url + "/auth/v1/logout", { method: "POST", headers: { apikey: CFG.key, Authorization: "Bearer " + s.access_token } }).catch(() => {});
        return { ok: !!(s && s.user), uid: s && s.user ? s.user.id : null };
      } catch (e) { return { error: msgOf(e) }; }
    },
    // الدخول تم (محلياً) — تبدأ المزامنة باسم هذا الموظف
    async setUser(emp) {
      if (!st || !emp) { user = null; stop(); renderChip(); showUpdateChip(false); return; }
      user = { uid: emp.cloudUserId || "", role: emp.role };
      if (!user.uid || !tokens[user.uid]) needLogin = true;
      try { const m = await membership(user.uid); if (m) user.role = m.role; if (!st.rules) await loadRules(); } catch (e) { /* offline */ }
      start(); renderChip();
    },
    // المالك يربط هذا الجهاز (وبياناته الحالية) بالسحابة لأول مرة
    async linkOwner(username, password, shopName, displayName) {
      if (!ls) return { error: "storage" };
      let uid = null;
      try { uid = keepSession(await api("/auth/v1/signup", { method: "POST", auth: false, body: { email: emailOf(username), password } })); }
      catch (e) {
        if (e.offline) return { error: "offline" };
        if (e.status === 422 || e.status === 400) { const r = await signInRaw(username, password); if (r.error) return { error: r.error === "bad-credentials" ? "exists-other-password" : r.error }; uid = r.uid; }
        else return { error: msgOf(e) };
      }
      if (!uid) return { error: "signup-failed" };
      user = { uid, role: "owner" };
      st = { shopId: null, cursor: 0, conflicts: [], rejected: [] };
      try {
        let m = await membership(uid);
        if (!m) { const shopId = await api("/rest/v1/rpc/create_shop", { method: "POST", body: { p_name: shopName || "997 Laundry", p_display_name: displayName || "" } }); m = { shop_id: shopId, role: "owner" }; }
        if (m.role !== "owner") throw new Error("not-owner");
        const existing = await api(`/rest/v1/records?select=record_id&shop_id=eq.${m.shop_id}&limit=1`);
        if (existing.length) throw new Error("cloud-has-data");
        st.shopId = m.shop_id;
        await loadRules();
        base = {}; saveBase(); saveSt();
        return { uid };
      } catch (e) {
        st = null; user = null; try { ls.removeItem(ST_KEY); } catch (e2) { /* ignore */ }
        return { error: e.offline ? "offline" : /already exists/.test(e.message) ? "shop-exists" : /not the shop owner/.test(e.message) ? "owner-not-named" : e.message };
      }
    },
    // رفع كل بيانات الجهاز (بعد linkOwner، وبعد أن يحفظ النظام رقم الحساب السحابي للمالك)
    async uploadAll(employeeId, onProgress) {
      if (!st || !user) return { error: "not-linked" };
      await api(`/rest/v1/shop_members?user_id=eq.${user.uid}`, { method: "PATCH", body: { employee_id: employeeId || null } }).catch(() => {});
      await lock();
      storeDirtyAll();
      let done = 0;
      try {
        for (const c of COLLECTIONS) {
          if (!dirty.has(c.key)) continue;
          dirty.delete(c.key);
          await pushCollection(c); saveBase(); saveSt();
          done++; if (onProgress) onProgress(done, c.name);
        }
        st.cursor = 0; stagedCursor = 0;
        await pull(); staged = new Map(); // ما رفعناه للتو يعود بنفس النسخ — لا شيء جديد
        st.cursor = stagedCursor; st.linkedAt = new Date().toISOString(); st.lastSyncAt = st.linkedAt; saveSt();
      } catch (e) { storeDirtyAll(); return { error: msgOf(e) }; } finally { busy = false; }
      start(); // بعد فك القفل — وإلا فكّ القفلُ المتأخر قفلَ أول مزامنة فتتداخل عمليتا رفع
      return { ok: true, rejected: (st.rejected || []).length };
    },
    // جهاز جديد: الدخول بحساب سحابي وتنزيل كل البيانات (يستبدل بيانات هذا الجهاز)
    async joinDevice(username, password) {
      if (!ls) return { error: "storage" };
      const r = await signInRaw(username, password);
      if (r.error) return { error: r.error };
      user = { uid: r.uid, role: "worker" };
      try {
        const m = await membership(r.uid);
        if (!m || !m.active) throw new Error("not-member");
        user.role = m.role;
        st = { shopId: m.shop_id, cursor: 0, conflicts: [], rejected: [] };
        base = {}; staged = new Map(); stagedCursor = 0;
        await loadRules();
        await pull();
        applyStaged(true);
        st.linkedAt = new Date().toISOString(); st.lastSyncAt = st.linkedAt; saveSt();
        return { uid: r.uid, role: m.role, employeeId: m.employee_id || null };
      } catch (e) {
        st = null; user = null; try { ls.removeItem(ST_KEY); ls.removeItem(BASE_KEY); } catch (e2) { /* ignore */ }
        return { error: e.offline ? "offline" : e.message };
      }
    },
    // حساب دخول لموظف جديد (يحتاج إنترنت) — يرجع رقم حسابه في السحابة
    async createStaff(username, tempPassword, role, displayName, employeeId) {
      try {
        const s = await api("/auth/v1/signup", { method: "POST", auth: false, body: { email: emailOf(username), password: tempPassword } });
        const uid = s && s.user ? s.user.id : null; // لا نحتفظ بجلسته — الموظف يدخل بنفسه
        if (!uid) return { error: "signup-failed" };
        await api("/rest/v1/shop_members", { method: "POST", body: { shop_id: st.shopId, user_id: uid, role, display_name: displayName || "", employee_id: employeeId || null } });
        return { uid };
      } catch (e) { return { error: e.status === 422 ? "username-taken" : msgOf(e) }; }
    },
    async updateMember(uid, patch) {
      try { await api(`/rest/v1/shop_members?user_id=eq.${uid}`, { method: "PATCH", headers: rep, body: patch }); return { ok: true }; }
      catch (e) { return { error: msgOf(e) }; }
    },
    async resetPassword(uid, password) {
      try { await api("/rest/v1/rpc/set_member_password", { method: "POST", body: { p_user: uid, p_password: password } }); return { ok: true }; }
      catch (e) { return { error: msgOf(e) }; }
    },
    async changeOwnPassword(password, uid) {
      try { await api("/auth/v1/user", { method: "PUT", body: { password }, as: uid }); return { ok: true }; }
      catch (e) { return { error: msgOf(e) }; }
    },
    // رقم طلب محجوز من السحابة (لا يتكرر بين الأجهزة)؛ null = يستخدم النظام الترقيم المحلي
    takeOrderNumber(min) {
      if (!st || !st.shopId) return null;
      if ((!st.numbers || st.numbers[0] > st.numbers[1]) && st.nextBlock) { st.numbers = st.nextBlock; st.nextBlock = null; }
      if (!st.numbers || st.numbers[0] > st.numbers[1]) { st.numbers = null; saveSt(); refillNumbers(min); return null; }
      const n = st.numbers[0];
      st.numbers = [n + 1, st.numbers[1]]; saveSt();
      if (st.numbers[1] - st.numbers[0] < 3 && !st.nextBlock) refillNumbers(min);
      return n;
    },
    prepareNumbers: (min) => refillNumbers(min),
    // قبل حفظ طلب: نتأكد من وجود رقم محجوز من السحابة (ننتظر حتى 6 ثوانٍ إن كان الحجز جارياً). false = بدون إنترنت
    async ensureNumbers(min) {
      if (!st || !st.shopId || !user) return false;
      const ready = () => (st.numbers && st.numbers[0] <= st.numbers[1]) || !!st.nextBlock;
      if (ready()) return true;
      await Promise.race([refillNumbers(Math.max(Number(min) || 1, localMaxNumber() + 1)), new Promise((r) => setTimeout(r, 6000))]);
      return ready();
    },
    syncNow: () => sync(true),
    applyNow: () => { if (staged.size) reloadNow(); },
    status,
    // يُفك ربط هذا الجهاز فقط (البيانات تبقى في السحابة وعلى الجهاز)
    unlink() { stop(); st = null; user = null; base = {}; staged = new Map(); dirty.clear(); try { ["l997_cloud", "l997_cloud_base", "l997_cloud_tokens"].forEach((k) => ls.removeItem(k)); } catch (e) { /* ignore */ } renderChip(); showUpdateChip(false); },
    // بعد مراجعة المالك: مسح قائمة التعارضات والرفض من اللوحة
    clearNotes() { if (st) { st.conflicts = []; st.rejected = []; saveSt(); renderChip(); } },
    _debug: () => ({ dirty: [...dirty], staged: staged.size, cursor: st && st.cursor, stagedCursor }),
  };
  const NUM_BLOCK = 10; // أرقام محجوزة لكل جهاز في كل مرة — صغيرة حتى تبقى الفجوات بين الأجهزة قليلة
  let refilling = null;
  function refillNumbers(min) {
    if (refilling) return refilling;
    if (!st || !st.shopId || !user) return Promise.resolve();
    refilling = refillNow(min).finally(() => { refilling = null; });
    return refilling;
  }
  async function refillNow(min) {
    try {
      const first = await api("/rest/v1/rpc/reserve_order_numbers", { method: "POST", body: { p_count: NUM_BLOCK, p_min: Math.max(1, Number(min) || 1) } });
      // الكتلة الحالية لم تنتهِ بعد → نحتفظ بالجديدة احتياطاً للمرة القادمة
      if (!st.numbers || st.numbers[0] > st.numbers[1]) st.numbers = [first, first + NUM_BLOCK - 1];
      else st.nextBlock = [first, first + NUM_BLOCK - 1];
      saveSt();
    } catch (e) { /* بدون إنترنت — النظام يستخدم الترقيم المحلي */ }
  }
  function status() {
    return {
      linked: !!(st && st.shopId), signedIn: !!user, needLogin, online,
      pending: dirty.size, incoming: staged.size, lastSyncAt: st ? st.lastSyncAt : null, linkedAt: st ? st.linkedAt : null, lastError,
      conflicts: st && st.conflicts ? st.conflicts.length : 0, rejected: st && st.rejected ? st.rejected.length : 0,
      conflictList: st && st.conflicts ? st.conflicts.slice(0, 20) : [], rejectedList: st && st.rejected ? st.rejected.slice(0, 20) : [],
    };
  }
  root.L997Cloud = api997;
})(typeof self !== "undefined" ? self : this);
