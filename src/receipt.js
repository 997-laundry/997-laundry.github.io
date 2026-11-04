/* ==========================================================================
   997 Laundry — رسم الإيصال (صورة) من محتوى جاهز
   يُستخدم داخل النظام (صورة / PDF للمشاركة) وفي صفحة الإيصال العامة r.html التي يفتحها العميل من رابط واتساب.
   ========================================================================== */
(function (root) {
  "use strict";
  function draw(m, logo) {
    const en = !!m.en, S = 2, W = 380 * S, pad = 22 * S;
    const FONT = (w, px) => `${w} ${px * S}px Tajawal, "Geeza Pro", "Segoe UI", Tahoma, Arial, sans-serif`;
    const C = { brand: "#5587C6", ink: "#132630", muted: "#5d707a", line: "#dbe6eb", good: "#1f7a55", goodBg: "#e2f3eb", warn: "#a86411", warnBg: "#fbf0e0", bad: "#b4372f", badBg: "#f9e6e4", soft: "#f4f8fa" };
    const rows = m.rows || [], totals = m.totals || [], paidRows = m.paidRows || [], pkgs = m.pkgs || [], st = m.status || { text: "", kind: "good" };
    const rowH = 30 * S, H = Math.round(150 * S + 110 * S + rows.length * rowH + 20 * S + totals.length * 26 * S + 60 * S + 70 * S + pkgs.length * 24 * S + paidRows.length * 30 * S + 120 * S + (m.footer ? 20 * S : 0));
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.direction = en ? "ltr" : "rtl";
    const start = en ? pad : W - pad, end = en ? W - pad : pad; // جهة بداية السطر ونهايته
    const txt = (s0, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(String(s0), x, y); };
    const fit = (s0, font, max) => { g.font = font; let x = String(s0); while (x.length > 3 && g.measureText(x).width > max) x = x.slice(0, -2); return x === String(s0) ? x : x + "…"; };
    const rrect = (x, y, w, h, r, color) => { g.fillStyle = color; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); };
    const startAlign = en ? "left" : "right", endAlign = en ? "right" : "left";
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
    // الترويسة
    g.fillStyle = C.brand; g.fillRect(0, 0, W, 130 * S);
    const bx = en ? pad : W - pad - 58 * S;
    rrect(bx, 30 * S, 58 * S, 68 * S, 14 * S, "#ffffff");
    if (logo && logo.complete && logo.naturalWidth) { const lh = 58 * S, lw = lh * logo.naturalWidth / logo.naturalHeight; g.drawImage(logo, bx + (58 * S - lw) / 2, 35 * S, lw, lh); }
    else txt("997", bx + 29 * S, 72 * S, FONT(800, 20), "#0C1E42", "center");
    const nx = en ? pad + 72 * S : W - pad - 72 * S;
    txt(fit(m.shopName || "997 Laundry", FONT(800, 22), W - 150 * S), nx, 62 * S, FONT(800, 22), "#ffffff", startAlign);
    txt(fit(m.sub || "", FONT(500, 13), W - 150 * S), nx, 88 * S, FONT(500, 13), "#e3f1f7", startAlign);
    let y = 166 * S;
    // العنوان لا يتداخل مع التاريخ
    g.font = FONT(500, 13); const dtW = g.measureText(m.dt || "").width;
    txt(fit(m.title || "", FONT(800, 18), W - 2 * pad - dtW - 16 * S), start, y, FONT(800, 18), C.ink, startAlign);
    txt(m.dt || "", end, y, FONT(500, 13), C.muted, endAlign);
    y += 28 * S;
    if (m.custName) { txt(fit(m.custName, FONT(700, 15), W * 0.55), start, y, FONT(700, 15), C.ink, startAlign); txt(m.custPhone || "", end, y, FONT(500, 13), C.muted, endAlign); }
    y += 22 * S;
    g.fillStyle = C.line; g.fillRect(pad, y, W - 2 * pad, 2 * S); y += 30 * S;
    const hd = m.heads || ["", "", ""];
    txt(hd[0], start, y, FONT(700, 12), C.muted, startAlign);
    txt(hd[1], W / 2 + (en ? 60 : -60) * S, y, FONT(700, 12), C.muted, "center");
    txt(hd[2], end, y, FONT(700, 12), C.muted, endAlign);
    y += 12 * S;
    rows.forEach((r, i) => {
      if (i % 2 === 0) { g.fillStyle = C.soft; g.fillRect(pad - 6 * S, y, W - 2 * pad + 12 * S, rowH); }
      const ty = y + 20 * S;
      txt(fit(r.a, FONT(500, 14), W * 0.5), start, ty, FONT(500, 14), C.ink, startAlign);
      txt(String(r.q), W / 2 + (en ? 60 : -60) * S, ty, FONT(700, 14), C.ink, "center");
      txt(r.v, end, ty, FONT(600, 14), C.ink, endAlign);
      y += rowH;
    });
    y += 22 * S;
    txt(m.pieces || "", start, y, FONT(600, 12), C.muted, startAlign);
    y += 32 * S;
    totals.forEach(([k, v]) => { txt(k, start, y, FONT(500, 14), C.muted, startAlign); txt(v, end, y, FONT(600, 14), C.ink, endAlign); y += 26 * S; });
    g.fillStyle = C.line; g.fillRect(pad, y - 8 * S, W - 2 * pad, 2 * S);
    y += 26 * S;
    txt(m.totalLabel || "", start, y, FONT(800, 20), C.ink, startAlign);
    txt(m.total || "", end, y, FONT(800, 22), C.brand, endAlign);
    y += 24 * S;
    paidRows.forEach(([k, v]) => { y += 6 * S; txt(k, start, y, FONT(600, 14), C.good, startAlign); txt(v, end, y, FONT(700, 14), C.good, endAlign); y += 22 * S; });
    const col = { good: [C.good, C.goodBg], warn: [C.warn, C.warnBg], bad: [C.bad, C.badBg] }[st.kind] || [C.good, C.goodBg];
    rrect(pad, y, W - 2 * pad, 44 * S, 12 * S, col[1]);
    txt(fit(st.text, FONT(800, 15), W - 4 * pad), W / 2, y + 28 * S, FONT(800, 15), col[0], "center");
    y += 66 * S;
    if (st.note) { txt(st.note, W / 2, y - 10 * S, FONT(600, 12), C.muted, "center"); y += 18 * S; }
    pkgs.forEach((l) => { txt(fit("🎟 " + l, FONT(500, 13), W - 2 * pad), start, y, FONT(500, 13), C.good, startAlign); y += 24 * S; });
    y += 10 * S;
    txt(m.thanks || "", W / 2, y, FONT(700, 15), C.ink, "center");
    y += 24 * S;
    if (m.footer) { txt(m.footer, W / 2, y, FONT(500, 11), C.muted, "center"); y += 20 * S; }
    // قصّ الفراغ الزائد أسفل الإيصال
    const out = document.createElement("canvas"); out.width = W; out.height = Math.min(H, Math.round(y + 14 * S));
    const og = out.getContext("2d"); og.fillStyle = "#ffffff"; og.fillRect(0, 0, W, out.height); og.drawImage(cv, 0, 0);
    return out;
  }
  root.L997Receipt = { draw };
})(typeof self !== "undefined" ? self : this);
