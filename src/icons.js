/* أيقونات الأصناف — رسومات SVG مخصصة لكل قطعة (بدل الإيموجي العامة) حتى يميّز الموظف القطعة من أول نظرة.
   نمط واحد: إطار 48×48، خط داكن 1.8، تعبئة بلون يميّز القطعة. window.L997Icons.svg(id, size) */
(function (root) {
  "use strict";
  const S = "#24586e"; // لون الخط
  const g = (inner, opt) => `<g fill="none" stroke="${(opt && opt.stroke) || S}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  const p = (d, fill, extra) => `<path d="${d}" fill="${fill || "none"}"${extra ? " " + extra : ""}/>`;
  const dots = (pts, r, fill) => pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="none"/>`).join("");

  // أشكال أساسية
  const robe = (fill, extra) => g(
    p("M18 6 Q24 9.5 30 6 L35 8.5 L43 27 L37.5 29 L34.5 20 L35 43.5 H13 L13.5 20 L10.5 29 L5 27 L13 8.5 Z", fill) +
    p("M18 6 Q24 10.5 30 6") + p("M24 9 V22") + dots([[24, 13], [24, 16.5], [24, 20]], 0.9, S) + (extra || ""));
  const abaya = (fill, extra) => g(
    p("M19 6 Q24 8.5 29 6 L36 10 L44.5 30.5 L37.5 32 L34 23 L37.5 44 H10.5 L14 23 L10.5 32 L3.5 30.5 L12 10 Z", fill, `stroke="#111"`) +
    p("M24 8 V44", "none", `stroke="#6b6b78"`) + (extra || ""), { stroke: "#111" });
  const tee = (fill, sleeveEnd, extra) => g(
    p(`M17 7 Q24 12 31 7 L40 11 L44 ${sleeveEnd} L37 ${sleeveEnd + 3} L35 19 V42 H13 V19 L11 ${sleeveEnd + 3} L4 ${sleeveEnd} L8 11 Z`, fill) + p("M17 7 Q24 12 31 7") + (extra || ""));
  const longTop = (fill, extra) => g(
    p("M17 7 Q24 12 31 7 L39 10 L44 33 L38.5 34.5 L35 20 V42 H13 V20 L9.5 34.5 L4 33 L9 10 Z", fill) + (extra || ""));
  const shirtBody = (fill, extra) => g(
    p("M16 7 L8 11 L4 31 L9.5 32 L12.5 19 V43 H35.5 V19 L38.5 32 L44 31 L40 11 L32 7 Z", fill) +
    p("M16 7 L20 13.5 L24 9.5 L28 13.5 L32 7", "#ffffff") + (extra || ""));
  const bed = (w, pillows, sheetFill, extra) => {
    const x0 = 24 - w / 2, x1 = 24 + w / 2;
    const pw = (w - 6) / pillows;
    let pl = "";
    for (let i = 0; i < pillows; i++) pl += p(`M${x0 + 3 + i * pw + 1} 17 h${pw - 2} a2 2 0 0 1 2 2 v2 a2 2 0 0 1 -2 2 h-${pw - 2} a2 2 0 0 1 -2 -2 v-2 a2 2 0 0 1 2 -2 Z`, "#ffffff");
    return g(p(`M${x0} 10 H${x1} V22 H${x0} Z`, "#c9a27a") + pl +
      p(`M${x0 - 1} 24 H${x1 + 1} V37 Q${x1 + 1} 39 ${x1 - 1} 39 H${x0 + 1} Q${x0 - 1} 39 ${x0 - 1} 37 Z`, sheetFill) +
      p(`M${x0} 39 V43 M${x1} 39 V43`) + (extra || ""));
  };
  const folded = (fill, y, extra) => p(`M8 ${y} H40 Q43 ${y} 43 ${y + 3} V${y + 6} Q43 ${y + 9} 40 ${y + 9} H8 Q5 ${y + 9} 5 ${y + 6} V${y + 3} Q5 ${y} 8 ${y} Z`, fill) + (extra || "");

  const ICONS = {
    thob_cotton: robe("#fbfdfe"),
    thob_wool: robe("#cdb594", p("M15 30 H33 M15 35 H33", "none", `stroke="#a88e6a" stroke-width="1"`)),
    // غترة: على رأس (وجه بسيط) — قماش أبيض ينسدل على الكتفين
    ghatra: g(p("M24 4 Q37 4 38 17 L44 41 L32 43 L30.5 27 Q24 31 17.5 27 L16 43 L4 41 L10 17 Q11 4 24 4 Z", "#fbfdfe") +
      `<ellipse cx="24" cy="20" rx="6.2" ry="7.6" fill="#f1c9a0"/>` + p("M15.5 14 Q24 8 32.5 14", "none", `stroke="#c7d6dd"`) +
      p("M8 33 L16.5 35 M40 33 L31.5 35", "none", `stroke="#c7d6dd"`)),
    agal: g(`<ellipse cx="24" cy="19" rx="15" ry="6" stroke="#111" stroke-width="3"/><ellipse cx="24" cy="25" rx="15" ry="6" stroke="#111" stroke-width="3"/>` +
      p("M35 30 L37 41 M38 29 L41 40", "none", `stroke="#111" stroke-width="2"`) + dots([[37, 42], [41, 41]], 1.6, "#111"), { stroke: "#111" }),
    abaya_plain: abaya("#26262e"),
    abaya_emb: abaya("#26262e", dots([[24, 14], [24, 19], [24, 24], [24, 29], [24, 34], [24, 39], [8.5, 29.5], [6, 29], [40, 29.5], [42, 29]], 1.3, "#e0b54a") +
      p("M19 6 Q24 9 29 6", "none", `stroke="#e0b54a" stroke-width="2"`)),
    shirt: shirtBody("#a9d2f0", p("M24 13 V43") + dots([[24, 18], [24, 24], [24, 30], [24, 36]], 0.9, S) + p("M15 22 h5 v4 h-5 Z")),
    tshirt: tee("#4fa3d6", 19),
    tshirt_half: tee("#f2a24c", 16, `<text x="24" y="33" text-anchor="middle" font-size="9" font-weight="700" fill="#24586e" stroke="none" font-family="Arial">½</text>`),
    pants_long: g(p("M14.5 6 H33.5 L35.5 44 H27 L24 17 L21 44 H12.5 Z", "#3f5f8f") + p("M14.5 10 H33.5") + p("M24 10 V17")),
    pants_short: g(p("M13 10 H35 L37.5 32 H26.5 L24 21 L21.5 32 H10.5 Z", "#8fae6f") + p("M13 14 H35")),
    jacket: g(p("M16 7 L8 11 L4 33 L9.5 34 L12.5 20 V43 H35.5 V20 L38.5 34 L44 33 L40 11 L32 7 L24 24 Z", "#4b6e8f") +
      p("M16 7 L20 18 L24 24 L28 18 L32 7") + dots([[24, 30], [24, 36]], 1.1, S) + p("M15 32 h6 M27 32 h6")),
    overcoat: g(p("M16 6 L8 10 L4 33 L9.5 34 L12.5 20 L12 40 H36 L35.5 20 L38.5 34 L44 33 L40 10 L32 6 L24 18 Z", "#b38c5c") +
      p("M16 6 L19 15 L24 18 L29 15 L32 6") + p("M12.5 27 H35.5", "none", `stroke-width="2.4"`) + dots([[20, 22], [28, 22], [20, 33], [28, 33]], 1.1, S)),
    overcoat_long: g(p("M16 5 L8 9 L4 32 L9.5 33 L12.5 19 L11 44.5 H37 L35.5 19 L38.5 33 L44 32 L40 9 L32 5 L24 17 Z", "#6e625a") +
      p("M16 5 L19 14 L24 17 L29 14 L32 5") + p("M24 17 V44.5") + dots([[26.5, 22], [26.5, 29], [26.5, 36]], 1.1, S)),
    suit2pcs: g(p("M16 7 L8 11 L4 33 L9.5 34 L12.5 20 V43 H35.5 V20 L38.5 34 L44 33 L40 11 L32 7 L24 24 Z", "#2f3f58") +
      p("M19 8 L24 22 L29 8", "#ffffff") + p("M23 11 L25 11 L25.8 19 L24 22 L22.2 19 Z", "#c0392b", `stroke="#8e2a20"`) + p("M16 7 L20 18 L24 24 L28 18 L32 7") + dots([[24, 31]], 1.1, "#ffffff")),
    dress: g(p("M19 6 L16.5 8 L17.5 19 L10 36 H38 L30.5 19 L31.5 8 L29 6 Q24 11 19 6 Z", "#ec82a6") + p("M17.5 19 H30.5") + p("M19 6 V3.5 M29 6 V3.5")),
    dress_long: g(p("M19 5 L16.5 7 L17.5 18 L9 44 H39 L30.5 18 L31.5 7 L29 5 Q24 10 19 5 Z", "#8f6ad3") + p("M17.5 18 H30.5") + p("M19 5 V2.5 M29 5 V2.5") +
      dots([[20, 28], [27, 33], [22, 38], [30, 39]], 0.9, "#f3e6ff")),
    blouse: g(p("M17 9 Q24 15 31 9 L38 12 L42 21 L36.5 23 L34 20 V40 Q24 43 14 40 V20 L11.5 23 L6 21 L10 12 Z", "#f6c3d4") +
      p("M21 13 L24 17 L27 13 L24 15.5 Z", "#e35d8c")),
    miniskirt: g(p("M15 12 H33 L38 31 H10 Z", "#6aa6d8") + p("M15 15.5 H33") + p("M20 15.5 L18 31 M24 15.5 V31 M28 15.5 L30 31", "none", `stroke-width="1.2"`)),
    skirtlong: g(p("M16 6 H32 L39 44 H9 Z", "#7c8fd8") + p("M16 9.5 H32") + p("M20 9.5 L16 44 M24 9.5 V44 M28 9.5 L32 44", "none", `stroke-width="1.2"`)),
    pullover: longTop("#c67e4e", p("M13 38 H35 M5 31 L9.5 32 M43 31 L38.5 32", "none", `stroke-width="2.6"`) + p("M17 7 Q24 12 31 7", "none", `stroke-width="2.6"`) +
      p("M18 22 h12 M18 27 h12", "none", `stroke="#a2603a" stroke-width="1"`)),
    hoodie_jacket: g(p("M17 9 Q16 3 24 3 Q32 3 31 9 L39 11 L44 34 L38.5 35.5 L35 21 V43 H13 V21 L9.5 35.5 L4 34 L9 11 Z", "#7c8898") +
      p("M17 9 Q24 15 31 9") + p("M24 13 V43", "none", `stroke-width="1.4" stroke-dasharray="2 1.6"`) + p("M15 31 H22 V37 H15 M33 31 H26 V37 H33") + p("M21 13 v5 M27 13 v5", "none", `stroke-width="1.2"`)),
    necktie: g(p("M20 5 H28 L26.5 11 H21.5 Z", "#c0392b") + p("M21.5 11 L17.5 34 L24 43 L30.5 34 L26.5 11 Z", "#d9483a") +
      p("M19.5 22 L28.5 18 M18.5 29 L29.5 24.5 M20 35.5 L30 31", "none", `stroke="#8e2a20" stroke-width="1.2"`)),
    kurta_pyjama: g(p("M18 5 Q24 8.5 30 5 L36 8 L42 25 L37 26.5 L34 17 L34.5 33 H13.5 L14 17 L11 26.5 L6 25 L12 8 Z", "#f1e2b4") +
      p("M24 7.5 V18") + dots([[24, 11], [24, 14.5]], 0.9, S) + p("M16 33 L15.5 44.5 H22.5 L24 36 L25.5 44.5 H32.5 L32 33", "#fbfdfe")),
    undershirt2pcs: g(p("M18 4 V9 Q24 15 30 9 V4 M18 4 Q14 6 13.5 12 L14 26 H34 L34.5 12 Q34 6 30 4", "#fbfdfe") +
      p("M14 30 H34 L32.5 38 Q28 38 26 43 H22 Q20 38 15.5 38 Z", "#fbfdfe")),
    underwear: g(p("M8 13 H40 L37 27 Q30 27.5 27.5 36 H20.5 Q18 27.5 11 27 Z", "#5aa2d9") + p("M8 17 H40")),
    socks: g(p("M10 6 H19 V27 L26 34 Q29 37.5 25.5 41 Q22 44 18.5 40.5 L11 33 Q10 32 10 30 Z", "#9ba7b3") + p("M10 10 H19", "none", `stroke-width="2.4"`) +
      p("M27 4 H36 V25 L41.5 31 Q44 34.5 41 37.5 Q38 40 35 37 L28 30 Q27 29 27 27 Z", "#c2cbd4") + p("M27 8 H36", "none", `stroke-width="2.4"`)),
    cap: g(p("M8 29 Q8 13 24 13 Q38 13 38 27 Z", "#3b7fd9") + p("M38 27 Q45 27.5 46 31 Q40 33 26 31 L8 29") + p("M24 13 V29 M16.5 14.5 Q14 21 14.5 28.5 M31 14.5 Q34 21 33.5 28") + dots([[24, 12.5]], 1.4, S)),
    gahfiya: g(p("M9 32 Q9 13 24 13 Q39 13 39 32 Z", "#fbfdfe") + p("M9 32 H39 V35 H9 Z", "#eef4f7") +
      dots([[16, 26], [20, 22], [24, 26], [28, 22], [32, 26], [20, 29.5], [28, 29.5], [24, 18.5], [16, 21.5], [32, 21.5]], 0.9, "#9fb7c2")),
    bisht: g(p("M17 5 H31 L43 42 L29 44 L24 12 L19 44 L5 42 Z", "#6c4b2c") + p("M19 44 L24 12 L29 44", "none", `stroke="#e0b54a" stroke-width="2.4"`) +
      p("M17 5 Q24 9 31 5", "none", `stroke="#e0b54a" stroke-width="2.4"`) + p("M7 42 L18.5 43.7 M29.5 43.7 L41 42", "none", `stroke="#e0b54a" stroke-width="1.4"`)),
    dupatta: g(p("M6 10 Q24 2 42 10 L38 40 Q33 37 30 40 L28 17 Q24 15 20 17 L18 40 Q15 37 10 40 Z", "#f4a8c5") +
      p("M10 40 v3 M13 39 v3 M16 39.5 v3 M32 39.5 v3 M35 39 v3 M38 40 v3", "none", `stroke-width="1.2"`) + dots([[24, 9.5], [16, 11], [32, 11]], 1, "#e0b54a")),
    // شيلة: وشاح أسود على الرأس ينسدل على الكتفين
    shaila: g(p("M24 4 Q37 4 38.5 18 Q40 30 44 42 H30 Q29 33 29 29 Q24 32 19 29 Q19 33 18 42 H4 Q8 30 9.5 18 Q11 4 24 4 Z", "#2b2b33", `stroke="#111"`) +
      `<ellipse cx="24" cy="20" rx="6" ry="7.4" fill="#f1c9a0" stroke="#111"/>` + p("M12 36 Q24 30 36 36", "none", `stroke="#5c5c68" stroke-width="1.2"`), { stroke: "#111" }),
    jalabiya: g(p("M18.5 5 Q24 9 29.5 5 L36 8.5 L45 27 L38.5 29.5 L34.5 20 L37.5 44 H10.5 L13.5 20 L9.5 29.5 L3 27 L12 8.5 Z", "#c95c7c") +
      p("M18.5 5 Q24 13 29.5 5", "none", `stroke="#e0b54a" stroke-width="2.2"`) + p("M24 11 V30", "none", `stroke="#e0b54a" stroke-width="2.2" stroke-dasharray="1.6 1.6"`) +
      p("M11 41 H37", "none", `stroke="#e0b54a" stroke-width="1.6"`)),
    bdf_uniform: shirtBody("#6f7d4c", dots([[17, 24], [30, 21], [21, 34], [32, 33], [15, 38], [27, 39], [8, 24], [40, 25]], 2.2, "#495531") + dots([[25, 27], [19, 29], [33, 27.5]], 1.8, "#a2a86f") +
      p("M15 18 h6 v5 h-6 Z M27 18 h6 v5 h-6 Z") + p("M24 13 V43")),
    shoes: g(p("M5 32 Q5 22 9 20 L18 22 Q22 15 27 17 L41 27 Q45 29 44.5 33 Z", "#fbfdfe") + p("M4.5 32 H45 V36 Q45 38 43 38 H6.5 Q4.5 38 4.5 36 Z", "#d7dfe4") +
      p("M20 21.5 L24 24 M23 19 L27 21.5 M26 17.5 L29.5 20", "none", `stroke-width="1.3"`) + p("M9 27 H18", "none", `stroke="#4fa3d6" stroke-width="2"`)),
    bedsheet_single: bed(22, 1, "#cfe5f5", p("M14 28 H34 M14 32 H34", "none", `stroke="#9cc3dc" stroke-width="1"`)),
    bedsheet_double: bed(36, 2, "#cfe5f5", p("M7 28 H41 M7 32 H41", "none", `stroke="#9cc3dc" stroke-width="1"`)),
    bedcover: bed(32, 2, "#9fc6a6", p("M7 27.5 H41", "none", `stroke-width="2.4"`)),
    bedspread: g(p("M10 10 H38 V22 H10 Z", "#c9a27a") + p("M4 24 H44 L44 39 Q41 42 38 39 Q35 42 32 39 Q29 42 26 39 Q23 42 20 39 Q17 42 14 39 Q11 42 8 39 Q6 41 4 39 Z", "#d9b5e3") +
      dots([[12, 31], [20, 31], [28, 31], [36, 31]], 1.4, "#a77ab8")),
    blanket_single: g(folded("#e7a65d", 18) + folded("#e7a65d", 27, p("M9 21 H39 M9 30 H39", "none", `stroke="#b8732f" stroke-width="1" stroke-dasharray="2 2"`))),
    blanket_double: g(folded("#c8713b", 9) + folded("#d98c50", 19) + folded("#c8713b", 29, p("M9 12 H39 M9 22 H39 M9 32 H39", "none", `stroke="#8e4a20" stroke-width="1" stroke-dasharray="2 2"`))),
    duvet: g(p("M6 12 Q6 8 10 8 H38 Q42 8 42 12 V36 Q42 40 38 40 H10 Q6 40 6 36 Z", "#f5f0e4") +
      p("M6 20 H42 M6 28 H42 M18 8 V40 M30 8 V40", "none", `stroke="#c9bfa6" stroke-width="1.2"`) + dots([[12, 14], [24, 14], [36, 14], [12, 24], [24, 24], [36, 24], [12, 34], [24, 34], [36, 34]], 1, "#c9bfa6")),
    pillowcase: g(p("M8 14 Q8 10 12 11 Q24 14 36 11 Q40 10 40 14 V34 Q40 38 36 37 Q24 34 12 37 Q8 38 8 34 Z", "#fbfdfe") + p("M12 16 Q24 18.5 36 16", "none", `stroke="#c7d6dd" stroke-width="1.2"`)),
    bathtowel: g(p("M6 8 H42", "none", `stroke-width="2.6"`) + p("M10 8 H38 V40 Q38 42 36 42 H12 Q10 42 10 40 Z", "#6cc4c9") +
      p("M10 33 H38 M10 36 H38", "none", `stroke="#fbfdfe" stroke-width="1.6"`) + p("M10 14 H38", "none", `stroke="#3e9aa0" stroke-width="1"`)),
    small_towel: g(p("M10 18 H38 Q41 18 41 21 V35 Q41 38 38 38 H10 Q7 38 7 35 V21 Q7 18 10 18 Z", "#f7b468") + p("M7 24 H41", "none", `stroke-width="1.4"`) +
      p("M11 32 H37", "none", `stroke="#fbfdfe" stroke-width="1.6"`)),
    bathrobe: g(p("M17 5 L9 9 L4 30 L9.5 31.5 L12.5 21 L12 44 H36 L35.5 21 L38.5 31.5 L44 30 L39 9 L31 5 L24 26 Z", "#fbfdfe") +
      p("M17 5 Q19 17 24 26 Q29 17 31 5") + p("M12.5 27 H35.5", "none", `stroke-width="2.6" stroke="#4fa3d6"`) + p("M24 27 L21 34 M24 27 L27 34", "none", `stroke="#4fa3d6" stroke-width="1.8"`)),
    curtain_per_m: g(p("M4 6 H44", "none", `stroke-width="2.6"`) + p("M6 7 H22 Q20 20 16 27 Q20 36 22 44 H6 Z", "#e8b9a3") + p("M42 7 H26 Q28 20 32 27 Q28 36 26 44 H42 Z", "#e8b9a3") +
      p("M10 9 V43 M14 9 V27 M38 9 V43 M34 9 V27", "none", `stroke="#c58c73" stroke-width="1"`) + dots([[17, 27], [31, 27]], 1.6, "#c58c73")),
    tablecloth: g(p("M9 18 H39 L41 30 Q37 32.5 33 30 Q29 32.5 25 30 Q21 32.5 17 30 Q13 32.5 9 30 Q8 30 7 30 Z", "#f0d36b") + p("M12 30 V42 M36 30 V42", "none", `stroke="#8a6a4a" stroke-width="2.2"`)),
    tablecloth_large: g(p("M4 16 H44 L46 33 Q42 35.5 38 33 Q34 35.5 30 33 Q26 35.5 22 33 Q18 35.5 14 33 Q10 35.5 6 33 Q4 33 2 33 Z", "#e8a65f") +
      p("M8 33 V43 M24 34 V43 M40 33 V43", "none", `stroke="#8a6a4a" stroke-width="2.2"`) + p("M6 20 H42", "none", `stroke="#b8732f" stroke-width="1" stroke-dasharray="2 2"`)),
    carpet_m2: g(p("M9 7 H39 V41 H9 Z", "#b9553d") + p("M13 11 H35 V37 H13 Z", "#e6c48e") + p("M24 14 L32 24 L24 34 L16 24 Z", "#b9553d") +
      p("M11 7 V4 M15 7 V4 M19 7 V4 M23 7 V4 M27 7 V4 M31 7 V4 M35 7 V4 M11 41 V44 M15 41 V44 M19 41 V44 M23 41 V44 M27 41 V44 M31 41 V44 M35 41 V44", "none", `stroke-width="1.2"`)),
  };
  // صنف أضافه المالك بنفسه: علّاقة ملابس
  const HANGER = g(p("M24 13 Q24 8 28 8.5 Q31 9.5 29.5 12.5 Q27.5 15 24 17") + p("M24 17 L5 32 Q4 35 7 35 H41 Q44 35 43 32 Z", "#e9f1f5"));

  function svg(id, size) {
    const body = ICONS[id] || HANGER;
    const s = size || 36;
    return `<svg class="gi" viewBox="0 0 48 48" width="${s}" height="${s}" aria-hidden="true" focusable="false">${body}</svg>`;
  }
  root.L997Icons = { svg, has: (id) => !!ICONS[id], ids: () => Object.keys(ICONS) };
})(typeof window !== "undefined" ? window : globalThis);
