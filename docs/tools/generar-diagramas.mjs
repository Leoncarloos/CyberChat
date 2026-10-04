// Genera los diagramas de arquitectura en español e inglés desde una sola definición:
//   docs/<nombre>.drawio y docs/<nombre>.en.drawio   (editables en draw.io)
//   docs/img/<nombre>.{es,en}.{svg,png}              (imágenes para los documentos)
// Uso: node docs/tools/generar-diagramas.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT = "Arial, Helvetica, sans-serif";

const C = {
  ink: "#1a1a1a",
  gray: "#666666",
  line: "#333333",
  white: "#ffffff",
  lane: "#f5f5f5",
  bll: "#e6e6e6",
  dal: "#d9d9d9",
  dark: "#3a3a3a",
  navy: "#1f3a5f",
  aiFill: "#e8eef7",
  soft: "#bbbbbb",
};

let lang = "es";
const t = (es, en) => (lang === "es" ? es : en);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Marcado dentro de una línea: [21] tamaño · **negrita** · //cursiva// · ^^gris^^
function parseLine(raw, defSize) {
  let size = defSize;
  let text = raw;
  const m = /^\[(\d+)\]/.exec(text);
  if (m) {
    size = Number(m[1]);
    text = text.slice(m[0].length);
  }
  const segs = [];
  let b = false;
  let i = false;
  let g = false;
  for (const part of text.split(/(\*\*|\/\/|\^\^)/)) {
    if (part === "**") b = !b;
    else if (part === "//") i = !i;
    else if (part === "^^") g = !g;
    else if (part) segs.push({ text: part, b, i, g });
  }
  return { size, segs, plain: segs.map((s) => s.text).join("") };
}

function textWidth(line) {
  return line.segs.reduce((n, s) => n + s.text.length * line.size * (s.b ? 0.56 : 0.5), 0);
}

function createDiagram(width, height) {
  const nodes = [];
  const edges = [];
  const byId = new Map();
  let auto = 0;

  function box(id, x, y, w, h, o = {}) {
    const node = {
      id: id ?? `n${++auto}`,
      x, y, w, h,
      shape: "rect",
      fill: C.white,
      stroke: C.line,
      strokeWidth: 1,
      dashed: false,
      lines: [],
      size: 14,
      align: "center",
      valign: "middle",
      color: C.ink,
      pad: 10,
      ...o,
    };
    nodes.push(node);
    byId.set(node.id, node);
    return node;
  }

  const text = (x, y, w, h, lines, o = {}) =>
    box(null, x, y, w, h, { shape: "text", fill: "none", stroke: "none", lines, align: "left", pad: 0, ...o });

  function edge(from, to, o = {}) {
    edges.push({
      id: `e${edges.length + 1}`,
      from, to,
      exit: [0.5, 1],
      entry: [0.5, 0],
      via: [],
      end: "block",
      start: "none",
      color: C.line,
      strokeWidth: 1.5,
      dashed: false,
      ...o,
    });
  }

  const anchor = (ref, f) => (Array.isArray(ref) ? ref : [byId.get(ref).x + f[0] * byId.get(ref).w, byId.get(ref).y + f[1] * byId.get(ref).h]);

  function label(at, lines, o = {}) {
    const parsed = (Array.isArray(lines) ? lines : [lines]).map((l) => parseLine(l, o.size ?? 13));
    const w = Math.max(...parsed.map(textWidth)) + 10;
    const h = parsed.reduce((n, l) => n + l.size * 1.25, 0) + 4;
    box(null, at[0] - w / 2, at[1] - h / 2, w, h, {
      shape: "text", fill: C.white, stroke: "none", pad: 0,
      lines: Array.isArray(lines) ? lines : [lines], size: o.size ?? 13, color: o.color ?? C.ink, align: "center",
    });
  }

  // ---------- SVG ----------
  function svgText(n) {
    const lines = n.lines.map((l) => parseLine(l, n.size));
    const total = lines.reduce((s, l) => s + l.size * 1.28, 0);
    const offset = n.shape === "cyl" ? 8 : 0;
    let y = n.valign === "top" ? n.y + n.pad : n.y + offset + (n.h - offset - total) / 2;
    const x = n.align === "left" ? n.x + n.pad : n.x + n.w / 2;
    const anchorAttr = n.align === "left" ? "start" : "middle";
    let out = "";
    for (const l of lines) {
      y += l.size * 1.28;
      const spans = l.segs
        .map((s, idx) => {
          const txt = idx === 0 ? s.text.replace(/^ +/, (sp) => " ".repeat(sp.length)) : s.text;
          return `<tspan${s.b ? ' font-weight="bold"' : ""}${s.i ? ' font-style="italic"' : ""}${s.g ? ` fill="${C.gray}"` : ""}>${esc(txt)}</tspan>`;
        })
        .join("");
      out += `<text x="${x}" y="${(y - l.size * 0.3).toFixed(1)}" font-size="${l.size}" text-anchor="${anchorAttr}" fill="${n.color}" xml:space="preserve">${spans}</text>`;
    }
    return out;
  }

  function svgShape(n) {
    const st = `fill="${n.fill}" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"${n.dashed ? ' stroke-dasharray="8 5"' : ""}`;
    const { x, y, w, h } = n;
    switch (n.shape) {
      case "text":
        return n.fill === "none" ? "" : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${n.fill}"/>`;
      case "round":
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.radius ?? 14}" ${st}/>`;
      case "pill":
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ${st}/>`;
      case "ellipse":
        return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${st}/>`;
      case "diamond":
        return `<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${st}/>`;
      case "cyl": {
        const r = 14;
        return (
          `<path d="M${x},${y + r} A${w / 2},${r} 0 0 1 ${x + w},${y + r} L${x + w},${y + h - r} A${w / 2},${r} 0 0 1 ${x},${y + h - r} Z" ${st}/>` +
          `<path d="M${x},${y + r} A${w / 2},${r} 0 0 0 ${x + w},${y + r}" fill="none" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"/>`
        );
      }
      case "note": {
        const k = 12;
        return (
          `<polygon points="${x},${y} ${x + w - k},${y} ${x + w},${y + k} ${x + w},${y + h} ${x},${y + h}" ${st}/>` +
          `<polyline points="${x + w - k},${y} ${x + w - k},${y + k} ${x + w},${y + k}" fill="none" stroke="${n.stroke}"/>`
        );
      }
      case "actor": {
        const cx = x + w / 2;
        const head = h * 0.14;
        return (
          `<ellipse cx="${cx}" cy="${y + head}" rx="${w * 0.26}" ry="${head}" fill="${C.dark}" stroke="${C.dark}"/>` +
          `<path d="M${cx},${y + head * 2} L${cx},${y + h * 0.66} M${x},${y + h * 0.36} L${x + w},${y + h * 0.36} M${cx},${y + h * 0.66} L${x},${y + h} M${cx},${y + h * 0.66} L${x + w},${y + h}" fill="none" stroke="${C.dark}" stroke-width="1.5"/>`
        );
      }
      default:
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${st}/>`;
    }
  }

  function svgMarker(kind, p, prev, color, sw) {
    const len = Math.hypot(p[0] - prev[0], p[1] - prev[1]) || 1;
    const u = [(p[0] - prev[0]) / len, (p[1] - prev[1]) / len];
    const nrm = [-u[1], u[0]];
    const at = (d, s = 0) => `${(p[0] - u[0] * d + nrm[0] * s).toFixed(1)},${(p[1] - u[1] * d + nrm[1] * s).toFixed(1)}`;
    const ln = (a, b) => `<path d="M${a} L${b}" stroke="${color}" stroke-width="${sw}" fill="none"/>`;
    if (kind === "block") return `<polygon points="${at(0)} ${at(11, 5)} ${at(11, -5)}" fill="${color}"/>`;
    if (kind === "one") return ln(at(6, 6), at(6, -6)) + ln(at(11, 6), at(11, -6));
    if (kind === "many") {
      const c = at(17).split(",");
      return (
        ln(at(11), at(0, 6)) + ln(at(11), at(0, -6)) +
        `<circle cx="${c[0]}" cy="${c[1]}" r="4.5" fill="${C.white}" stroke="${color}" stroke-width="${sw}"/>`
      );
    }
    return "";
  }

  function svgEdge(e) {
    const pts = [anchor(e.from, e.exit), ...e.via, anchor(e.to, e.entry)];
    const r = 8;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let k = 1; k < pts.length - 1; k++) {
      const [a, b, c] = [pts[k - 1], pts[k], pts[k + 1]];
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const r1 = Math.min(r, l1 / 2);
      const r2 = Math.min(r, l2 / 2);
      const p1 = [b[0] - ((b[0] - a[0]) / l1) * r1, b[1] - ((b[1] - a[1]) / l1) * r1];
      const p2 = [b[0] + ((c[0] - b[0]) / l2) * r2, b[1] + ((c[1] - b[1]) / l2) * r2];
      d += ` L${p1[0].toFixed(1)},${p1[1].toFixed(1)} Q${b[0]},${b[1]} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L${last[0]},${last[1]}`;
    return (
      `<path d="${d}" fill="none" stroke="${e.color}" stroke-width="${e.strokeWidth}"${e.dashed ? ' stroke-dasharray="6 4"' : ""}/>` +
      svgMarker(e.end, last, pts[pts.length - 2], e.color, e.strokeWidth) +
      svgMarker(e.start, pts[0], pts[1], e.color, e.strokeWidth)
    );
  }

  function toSvg() {
    const back = nodes.filter((n) => n.layer === "back");
    const front = nodes.filter((n) => n.layer !== "back");
    const draw = (list) => list.map((n) => svgShape(n) + svgText(n)).join("\n");
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${FONT}">\n` +
      `<rect width="${width}" height="${height}" fill="${C.white}"/>\n` +
      `${draw(back)}\n${edges.map(svgEdge).join("\n")}\n${draw(front)}\n</svg>\n`
    );
  }

  // ---------- draw.io ----------
  function htmlLabel(n) {
    return n.lines
      .map((raw) => {
        const l = parseLine(raw, n.size);
        const inner = l.segs
          .map((s, idx) => {
            let h = esc(idx === 0 ? s.text.replace(/^ +/, (sp) => " ".repeat(sp.length)) : s.text);
            if (s.g) h = `<font color="${C.gray}">${h}</font>`;
            if (s.i) h = `<i>${h}</i>`;
            if (s.b) h = `<b>${h}</b>`;
            return h;
          })
          .join("");
        return `<span style="font-size:${l.size}px">${inner}</span>`;
      })
      .join("<br>");
  }

  const SHAPE_STYLE = {
    rect: "rounded=0;",
    round: "rounded=1;absoluteArcSize=1;arcSize=28;",
    pill: "rounded=1;arcSize=50;",
    ellipse: "ellipse;",
    diamond: "rhombus;",
    cyl: "shape=cylinder3;boundedLbl=1;backgroundOutline=1;size=14;",
    note: "shape=note;size=12;backgroundOutline=1;",
    actor: "shape=umlActor;fillColor=#3a3a3a;",
    text: "text;",
  };
  const MARKER = { block: "block", one: "ERmandOne", many: "ERzeroToMany", none: "none" };

  function toDrawio(name) {
    const cells = [];
    const vertex = (n) => {
      let style = `${SHAPE_STYLE[n.shape]}html=1;fontFamily=Helvetica;fontSize=${n.size};fontColor=${n.color};align=${n.align};verticalAlign=${n.valign};`;
      if (n.shape === "text") {
        style += n.fill === "none" ? "fillColor=none;strokeColor=none;" : `fillColor=${n.fill};strokeColor=none;`;
      } else if (n.shape !== "actor") {
        style += `fillColor=${n.fill};strokeColor=${n.stroke};strokeWidth=${n.strokeWidth};`;
      }
      if (n.dashed) style += "dashed=1;dashPattern=8 5;";
      if (n.align === "left") style += `spacingLeft=${n.pad};`;
      if (n.valign === "top") style += `spacingTop=${Math.max(0, n.pad - 4)};`;
      cells.push(
        `<mxCell id="${n.id}" value="${esc(htmlLabel(n))}" style="${style}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`
      );
    };
    nodes.filter((n) => n.layer === "back").forEach(vertex);
    for (const e of edges) {
      const filled = e.end === "block" ? 1 : 0;
      let style = `edgeStyle=none;rounded=1;html=1;strokeColor=${e.color};strokeWidth=${e.strokeWidth};endArrow=${MARKER[e.end]};endFill=${filled};startArrow=${MARKER[e.start]};startFill=0;endSize=9;startSize=9;`;
      if (e.dashed) style += "dashed=1;";
      let attrs = "";
      let points = "";
      if (Array.isArray(e.from)) points += `<mxPoint x="${e.from[0]}" y="${e.from[1]}" as="sourcePoint"/>`;
      else {
        attrs += ` source="${e.from}"`;
        style += `exitX=${e.exit[0]};exitY=${e.exit[1]};exitDx=0;exitDy=0;`;
      }
      if (Array.isArray(e.to)) points += `<mxPoint x="${e.to[0]}" y="${e.to[1]}" as="targetPoint"/>`;
      else {
        attrs += ` target="${e.to}"`;
        style += `entryX=${e.entry[0]};entryY=${e.entry[1]};entryDx=0;entryDy=0;`;
      }
      if (e.via.length) {
        points += `<Array as="points">${e.via.map((p) => `<mxPoint x="${p[0]}" y="${p[1]}"/>`).join("")}</Array>`;
      }
      cells.push(
        `<mxCell id="${e.id}" style="${style}" edge="1" parent="1"${attrs}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`
      );
    }
    nodes.filter((n) => n.layer !== "back").forEach(vertex);
    return (
      `<mxfile host="app.diagrams.net"><diagram id="${name}" name="${name}">` +
      `<mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/>\n` +
      `${cells.join("\n")}\n</root></mxGraphModel></diagram></mxfile>\n`
    );
  }

  return { box, text, edge, label, toSvg, toDrawio };
}

// ============================================================ 1. Modelo ER
function modeloEntidadRelacion() {
  const d = createDiagram(1520, 900);
  d.text(20, 4, 900, 32, [`[20]**${t("CyberChat · Modelo entidad-relación (base de datos)", "CyberChat · Entity-Relationship model (database)")}**`]);

  const ROW = 17;
  function table(id, x, y, w, title, rows, o = {}) {
    const headH = o.stereo ? 44 : 30;
    const bodyH = rows.length * ROW + 12;
    const head = o.external ? C.navy : o.legacy ? "#5a5a5a" : C.dark;
    const fill = o.external ? C.aiFill : o.fill ?? "#f0f0f0";
    d.box(id, x, y, w, headH + bodyH, { fill, stroke: o.external ? C.navy : "#555555", dashed: Boolean(o.external), radius: 4, shape: "round" });
    d.box(null, x, y, w, headH, {
      fill: head, stroke: head, color: C.white, size: 13,
      lines: o.stereo ? [`//«${o.stereo}»//`, `**${title}**`] : [`**${title}**`],
    });
    const keyW = o.keyW ?? 30;
    rows.forEach(([key, name, type], k) => {
      const ry = y + headH + 6 + k * ROW;
      if (key) d.text(x + 8, ry, keyW, ROW, [`**${key}**`], { size: 13 });
      d.text(x + 8 + keyW, ry, w - keyW - 12, ROW, [type ? `${name}  ^^${type}^^` : name], { size: 13 });
    });
  }

  const uid = ["PK", "id", "uuid"];
  const userFk = ["FK", "user_id", "uuid · CASCADE"];

  table("storage", 20, 40, 330, "storage.objects", [
    ["", "bucket", t("documents (privado)", "documents (private)")],
    ["", "name", "= documents.storage_path"],
  ], { stereo: t("externo · Storage", "external · Storage"), external: true });
  table("documents", 20, 180, 330, "documents", [
    uid, ["", "name", "text"], ["", "storage_path", "text"], ["FK", "uploaded_by", "uuid · NO ACTION"], ["", "created_at", "timestamptz"],
  ]);
  table("chunks", 20, 378, 330, "document_chunks", [
    uid, ["FK", "document_id", "uuid · CASCADE"], ["", "content", "text"], ["", "chunk_index", "int"], ["", "embedding", "vector(384)"], ["", "created_at", "timestamptz"],
  ]);
  table("summaries", 20, 553, 330, "org_summaries", [
    uid, ["", "ruc", "text"], ["", "period", "text · week|month|quarter|all"], ["", "summary_text", "text"], ["", "warnings", "jsonb"], ["", "metrics", "jsonb"], ["FK", "generated_by", "uuid · SET NULL"], ["", "generated_at", "timestamptz"],
  ], { fill: "#d4d4d4" });
  table("conversations", 600, 80, 300, "conversations", [uid, userFk, ["", "title", "text"], ["", "created_at", "timestamptz"]], { fill: "#f7f7f7" });
  table("messages", 1020, 72, 300, "messages", [
    uid, ["FK", "conversation_id", "uuid · CASCADE"], ["", "role", "text · user|assistant"], ["", "content", "text"], ["", "created_at", "timestamptz"],
  ], { fill: "#f7f7f7" });
  table("users", 660, 350, 340, "auth.users", [
    uid, ["", "email", "text"], ["", "app_metadata", "jsonb"], ["", "   role · ruc · approval_status · diagnostic_done", ""],
    ["", "user_metadata", "jsonb"], ["", t("   datos de perfil (nombre, teléfono)", "   profile data (name, phone)"), ""],
  ], { stereo: t("externo · Supabase Auth", "external · Supabase Auth"), external: true });
  table("diagnostic", 1160, 250, 340, "diagnostic_results", [
    uid, userFk, ["", "score", "int"], ["", "total", "int"], ["", "topics_performance", "jsonb"], ["", "completed_at", "timestamptz"],
  ], { fill: "#e4e4e4" });
  table("attempts", 1160, 410, 340, "evaluation_attempts", [
    uid, userFk, ["", "test_type", "text · posttest|recurrente"], ["", "score", "int"], ["", "total", "int"], ["", "topics_performance", "jsonb"], ["", "taken_at", "timestamptz"],
  ], { fill: "#e4e4e4" });
  table("quiz", 1160, 585, 340, "quiz_results", [uid, userFk, ["", "score", "int"], ["", "total", "int"], ["", "taken_at", "timestamptz"]], {
    stereo: t("heredada", "legacy"), legacy: true, fill: "#e4e4e4",
  });
  table("progress", 1160, 740, 340, "learning_progress", [
    uid, userFk, ["", "topic_key", "text"], ["", "status", "text · pendiente|en_progreso|completado"], ["", "updated_at", "timestamptz"], ["UQ", "(user_id, topic_key)", ""],
  ], { fill: "#d4d4d4" });
  table("seen", 520, 630, 250, "seen_questions", [
    ["PK,FK", "user_id", "uuid · CASCADE"], ["PK,FK", "question_id", "uuid · CASCADE"], ["", "seen_at", "timestamptz"],
  ], { keyW: 46, fill: "#e4e4e4" });
  table("questions", 840, 590, 260, "posttest_questions", [
    uid, ["", "topic_key", "text"], ["", "question", "text"], ["", "options", "jsonb"], ["", "correct_index", "int · 0..3"], ["", "explanation", "text"], ["", "active", "bool"], ["", "created_at", "timestamptz"],
  ], { fill: "#e4e4e4" });

  d.box(null, 70, 762, 340, 60, {
    shape: "note", fill: C.white, stroke: "#999999", align: "left", size: 13, pad: 8,
    lines: t(
      ["La organización es lógica: el RUC vive en", "app_metadata y en org_summaries.ruc.", "No existe una tabla de organizaciones."],
      ["Organization identity is logical: the RUC lives in", "app_metadata and in org_summaries.ruc.", "There is no organizations table."]
    ),
  });

  const er = { start: "one", end: "many" };
  const it = (s) => `//${s}//`;
  d.edge("storage", "documents", { end: "none", dashed: true });
  d.label([185, 157], it(t("ruta", "path")));
  d.edge("documents", "chunks", er);
  d.label([185, 343], it(t("se fragmenta en", "split into")));
  d.edge("users", "documents", { ...er, exit: [0, 0.2], entry: [1, 0.45], via: [[500, 381.6], [500, 237.15]] });
  d.label([500, 312], it(t("sube", "uploads")));
  d.edge("users", "summaries", { ...er, exit: [0, 0.62], entry: [1, 0.48], via: [[500, 447.96], [500, 638.44]] });
  d.label([500, 541], it(t("genera", "generates")));
  d.edge("users", "conversations", { ...er, exit: [0.265, 0], entry: [0.5, 1] });
  d.label([750, 271], it(t("inicia", "starts")));
  d.edge("conversations", "messages", { ...er, exit: [1, 0.5], entry: [0, 0.496] });
  d.label([960, 135], it(t("contiene", "contains")));
  d.edge("users", "seen", { ...er, exit: [0.1765, 1], entry: [0.8, 0] });
  d.label([720, 568], it(t("ya vio", "has seen")));
  d.edge("questions", "seen", { ...er, exit: [0, 0.5], entry: [1, 0.527] });
  d.edge("users", "diagnostic", { ...er, exit: [1, 0.18], entry: [0, 0.5], via: [[1110, 378.44], [1110, 322]] });
  d.label([1055, 378], it(t("completa", "completes")));
  d.edge("users", "attempts", { ...er, exit: [1, 0.355], entry: [0, 0.5], via: [[1140, 406.09], [1140, 490.5]] });
  d.label([1070, 406], it(t("rinde", "takes")));
  d.edge("users", "quiz", { ...er, exit: [1, 0.53], entry: [0, 0.5], via: [[1130, 433.74], [1130, 655.5]] });
  d.edge("users", "progress", { ...er, exit: [1, 0.71], entry: [0, 0.5], via: [[1120, 462.18], [1120, 812]] });
  return d;
}

// ============================================================ 2. Vista lógica 4+1
function arquitecturaLogica() {
  const d = createDiagram(2000, 975);
  d.text(10, 4, 1500, 40, [`[26]**${t("CyberChat · ¿Qué puede hacer cada persona en la plataforma?", "CyberChat · What can each person do on the platform?")}**`]);
  d.text(16, 46, 1500, 30, [
    `[16]${t(
      "Vista lógica (modelo 4+1 de Kruchten) pensada para quienes usan la plataforma: las funciones principales y cómo se conectan.",
      "Logical view (Kruchten's 4+1 model) designed for those who use the platform: the main functions and how they connect."
    )}`,
  ]);
  d.box(null, 0, 85, 1560, 315, { shape: "round", fill: C.lane, stroke: "none", layer: "back" });
  d.box(null, 0, 425, 1560, 365, { shape: "round", fill: C.lane, stroke: "none", layer: "back" });

  d.box(null, 98, 120, 80, 95, { shape: "actor" });
  d.text(0, 228, 286, 120, t(
    ["[18]**Administrador**", "dueño de la empresa", "Gestiona el equipo y los", "documentos; ve el dashboard", "de toda la organización"],
    ["[18]**Administrator**", "company owner", "Manages the team and the", "documents; sees the dashboard", "of the whole organization"]
  ), { align: "center", size: 16 });
  d.box(null, 98, 455, 80, 95, { shape: "actor" });
  d.text(0, 553, 286, 120, t(
    ["[18]**Empleado**", "personal de la empresa", "Rinde evaluaciones, sigue su", "ruta de aprendizaje y consulta", "al asistente"],
    ["[18]**Employee**", "company staff", "Takes assessments, follows their", "learning path and asks", "the assistant"]
  ), { align: "center", size: 16 });

  const AI = t("IA", "AI");
  function card(id, x, y, w, h, num, title, bullets, o = {}) {
    const head = o.blue ? C.navy : C.dark;
    d.box(id, x, y, w, h, { shape: "round", radius: 6, fill: o.blue ? C.aiFill : o.fill ?? C.white, stroke: head });
    d.box(null, x, y, w, 50, { shape: "round", radius: 6, fill: head, stroke: head });
    d.box(null, x + 9, y + 9, 32, 32, { shape: "ellipse", fill: C.white, stroke: C.white, lines: [String(num)], size: 15 });
    d.text(x + 59, y + 10, w - 120, 30, [`**${title}**`], { size: 17, color: C.white });
    if (o.ai) d.box(null, x + w - 62, y + 12, 44, 26, { shape: "pill", fill: C.white, stroke: C.white, lines: [`**${AI}**`], size: 13 });
    d.text(x + 14, y + 62, w - 20, h - 70, bullets, { size: 16, valign: "top" });
  }

  card("f1", 288, 120, 365, 260, 1, t("Acceso y equipo", "Access and team"), t(
    ["•  Registra la empresa (RUC)", "•  Los empleados solicitan acceso", "•  El administrador aprueba o rechaza", "•  Cada persona ingresa con su cuenta"],
    ["•  Registers the company (RUC)", "•  Employees request access", "•  The administrator approves or rejects", "•  Each person signs in with an account"]
  ));
  card("f2", 774, 122, 365, 260, 2, t("Documentos de la empresa", "Company documents"), t(
    ["•  Sube políticas y guías", "    (PDF, Word o TXT)", "•  La plataforma los lee y organiza", "•  Solo su empresa puede usarlos", "•  Se pueden eliminar o reprocesar"],
    ["•  Uploads policies and guides", "    (PDF, Word or TXT)", "•  The platform reads and organizes them", "•  Only their company can use them", "•  They can be deleted or reprocessed"]
  ));
  d.box(null, 1177, 107, 362, 120, { shape: "round", radius: 6, fill: C.white, stroke: "none" });
  d.text(1193, 120, 340, 100, t(
    ["[17]**Cómo leer este diagrama**", "1 - 6  Funciones de la plataforma", "**IA**  Usa inteligencia artificial", "→  Alimenta o conduce a la siguiente"],
    ["[17]**How to read this diagram**", "1 - 6  Platform functions", "**AI**  Uses artificial intelligence", "→  Feeds or leads to the next one"]
  ), { size: 16, valign: "top" });
  card("f3", 288, 459, 365, 227, 3, t("Diagnóstico y evaluaciones", "Diagnostic and assessments"), t(
    ["•  Diagnóstico inicial: 16 preguntas", "•  Post-test para medir la mejora", "•  Nueva evaluación cada 5 días", "•  Resultado por tema:", "    Bajo · Medio · Alto"],
    ["•  Initial diagnostic: 16 questions", "•  Post-test to measure improvement", "•  New assessment every 5 days", "•  Result per topic:", "    Low · Medium · High"]
  ), { fill: "#ebebeb" });
  card("f4", 781, 459, 316, 227, 4, t("Ruta de aprendizaje", "Learning path"), t(
    ["•  Prioriza los temas más débiles", "•  Prompts de arranque por tema", "•  Recomendaciones personalizadas", "•  Progreso por tema:", "    pendiente · en progreso ·", "    completado"],
    ["•  Prioritizes the weakest topics", "•  Starter prompts per topic", "•  Personalized recommendations", "•  Progress per topic:", "    pending · in progress ·", "    completed"]
  ), { fill: "#ebebeb", ai: true });
  card("f5", 1176, 459, 326, 227, 5, t("Asistente virtual", "Virtual assistant"), t(
    ["•  Responde dudas de ciberseguridad", "•  Usa los documentos de la empresa", "•  Muestra qué fragmentos usó", "•  Sin documentos: respuesta general", "•  Guarda el historial del chat"],
    ["•  Answers cybersecurity questions", "•  Uses the company's documents", "•  Shows which fragments it used", "•  No documents: general answer", "•  Keeps the chat history"]
  ), { blue: true, ai: true });

  d.box("f6", 1613, 87, 385, 600, { shape: "round", radius: 6, fill: "#cfcfcf", stroke: "#8c8c8c" });
  d.box(null, 1613, 87, 385, 50, { shape: "round", radius: 6, fill: "#8c8c8c", stroke: "#8c8c8c" });
  d.box(null, 1622, 96, 32, 32, { shape: "ellipse", fill: C.white, stroke: C.white, lines: ["6"], size: 15 });
  d.text(1672, 97, 240, 30, [`**${t("Seguimiento del progreso", "Progress tracking")}**`], { size: 17, color: C.white });
  d.box(null, 1915, 99, 44, 26, { shape: "pill", fill: C.white, stroke: C.white, lines: [`**${AI}**`], size: 13 });
  const panel = (y, h, lines) => {
    d.box(null, 1629, y, 343, h, { shape: "round", radius: 8, fill: C.white, stroke: "#8c8c8c" });
    d.text(1644, y + 8, 320, h - 12, lines, { size: 16, valign: "top" });
  };
  panel(145, 155, t(
    ["[17]**Mi dashboard · Empleado**", "•  Puntaje por tema y nivel", "•  Mejora: diagnóstico → post-test", "•  Consultas hechas al asistente", "•  Recomendaciones personalizadas"],
    ["[17]**My dashboard · Employee**", "•  Score per topic and level", "•  Improvement: diagnostic → post-test", "•  Questions asked to the assistant", "•  Personalized recommendations"]
  ));
  panel(322, 192, t(
    ["[17]**Dashboard organizacional ·**", "[17]**Administrador**", "•  Índice de concientización", "•  Personas con 50 % o más", "•  Riesgo por persona: bajo · medio · alto", "•  Temas más débiles del equipo", "•  Descarga en CSV"],
    ["[17]**Organization dashboard ·**", "[17]**Administrator**", "•  Awareness index", "•  People scoring 50 % or higher", "•  Risk per person: low · medium · high", "•  Team's weakest topics", "•  CSV download"]
  ));
  panel(531, 125, t(
    [`[17]**Resumen ejecutivo · IA**`, "•  Texto breve para apoyar decisiones", "•  Usa datos agregados y anónimos", "•  Caché de 1 hora; se puede regenerar"],
    [`[17]**Executive summary · AI**`, "•  Short text to support decisions", "•  Uses aggregated, anonymous data", "•  Cached for 1 hour; can be regenerated"]
  ));

  const thick = { strokeWidth: 2.2, color: "#000000" };
  const lab = (at, lines) => d.label(at, lines.map((l) => `//**${l}**//`), { size: 15, color: "#4a5560" });
  d.edge("f1", "f3", { ...thick, exit: [0.4986, 1], entry: [0.4986, 0] });
  lab([572, 409], [t("empleados aprobados", "approved employees")]);
  d.edge("f2", "f5", { ...thick, exit: [1, 0.5], entry: [0.497, 0], via: [[1338, 252]] });
  lab([1254, 283], t(["alimenta las respuestas", "con sus documentos"], ["feeds the answers", "with its documents"]));
  d.edge("f3", "f4", { ...thick, exit: [1, 0.5], entry: [0, 0.5] });
  lab([709, 592], t(["según", "su nivel"], ["according to", "their level"]));
  d.edge("f4", "f5", { ...thick, exit: [1, 0.5], entry: [0, 0.5] });
  lab([1137, 593], t(["prompts de", "arranque"], ["starter", "prompts"]));
  d.edge("f5", "f6", { ...thick, exit: [1, 0.5], entry: [0, 0.497], via: [[1557, 572.5], [1557, 385.2]] });
  lab([1557, 601], t(["sus", "consultas"], ["their", "questions"]));
  d.edge("f4", "f6", { ...thick, exit: [0.408, 1], entry: [0.566, 1], via: [[909.9, 728], [1830.9, 728]] });
  lab([1283, 718], [t("resultados y progreso", "results and progress")]);
  d.edge("f3", "f6", { ...thick, exit: [0.367, 1], entry: [0.74, 1], via: [[421.96, 764], [1897.9, 764]] });

  d.text(3, 806, 400, 24, [`**${t("Los 8 temas evaluados", "The 8 topics assessed")}**`], { size: 17 });
  const topics = t(
    [["Phishing e", "ingeniería social"], ["IA y nuevas", "amenazas"], ["Canales de venta", "digitales"], ["Contraseñas"], ["Control de", "accesos"], ["Información", "del cliente"], ["Datos", "sensibles"], ["Resiliencia"]],
    [["Phishing and", "social engineering"], ["AI and emerging", "threats"], ["Digital sales", "channels"], ["Passwords"], ["Access", "control"], ["Customer", "information"], ["Sensitive", "data"], ["Resilience"]]
  );
  [1, 247, 492, 748, 1005, 1268, 1522, 1776].forEach((x, k) =>
    d.box(null, x, 833, 222, 60, { shape: "pill", fill: C.lane, stroke: C.line, lines: topics[k], size: 16 })
  );
  d.text(3, 931, 180, 24, [`**${t("Nivel por tema", "Level per topic")}**`], { size: 17 });
  const level = (x, w, line) => d.box(null, x, 925, w, 36, { shape: "pill", fill: "#e0e0e0", stroke: "#888888", lines: [line], size: 16 });
  level(183, 250, t("**Bajo**: menos de 50 %", "**Low**: below 50 %"));
  level(448, 290, t("**Medio**: de 50 % a menos de 75 %", "**Medium**: 50 % to below 75 %"));
  level(753, 235, t("**Alto**: 75 % o más", "**High**: 75 % or more"));
  return d;
}

// ============================================================ 3. Arquitectura en 3 capas
function arquitectura3Capas() {
  const d = createDiagram(2000, 1105);
  const layer = (id, y, h, lines) => {
    d.box(id, 0, y, 1998, h, { fill: C.lane, stroke: C.gray, layer: "back" });
    d.text(26, y + 20, 210, h - 40, lines, { size: 19 });
  };
  layer("ui", 0, 194, t(
    ["[20]**Interfaz de usuario**", "Presentación", "", "Navegador"],
    ["[20]**User Interface**", "Presentation", "", "Browser"]
  ));
  layer("bll", 274, 194, t(
    ["[20]**Capa de lógica**", "[20]**de negocio**", "Lógica de negocio"],
    ["[20]**Business**", "[20]**Logic Layer**", "Business logic"]
  ));
  layer("dal", 548, 194, t(
    ["[20]**Capa de acceso**", "[20]**a datos**", "Acceso a datos"],
    ["[20]**Data Access**", "[20]**Layer**", "Data access"]
  ));
  layer("ext", 822, 210, t(
    ["[20]**Externos**", "Datos e IA", "", "Servicios en la nube"],
    ["[20]**External**", "Data and AI", "", "Cloud services"]
  ));

  const node = (id, x, y, w, h, fill, lines, o = {}) =>
    d.box(id, x, y, w, h, { shape: "round", fill, lines: [`[20]**${lines[0]}**`, ...lines.slice(1)], size: 19, ...o });
  const ai = { stroke: C.navy };

  node("u1", 242, 33, 549, 128, C.white, t(
    ["Acceso", "login · registro de empresa y de empleado ·", "recuperación de contraseña"],
    ["Access", "login · company and employee registration ·", "password recovery"]
  ));
  node("u2", 830, 33, 549, 128, C.white, t(
    ["Empleado", "diagnóstico · ruta de aprendizaje · chat con IA ·", "evaluaciones · dashboard personal"],
    ["Employee", "diagnostic · learning path · AI chat · assessments ·", "personal dashboard"]
  ));
  node("u3", 1416, 33, 549, 128, C.white, t(
    ["Administrador", "gestión de empleados · documentos ·", "dashboard organizacional"],
    ["Administrator", "employee management · documents ·", "organizational dashboard"]
  ));

  node("b1", 242, 307, 402, 128, C.bll, t(
    ["Usuarios y acceso", "registro · aprobación · roles ·", "validación de datos"],
    ["Users and access", "registration · approval · roles ·", "data validation"]
  ));
  node("b2", 683, 307, 402, 128, C.bll, t(
    ["Asistente RAG", "indexar documentos · recuperar el contexto", "de su organización · armar el prompt"],
    ["RAG assistant", "index documents · retrieve its", "organization's context · build the prompt"]
  ));
  node("b3", 1123, 307, 402, 128, C.bll, t(
    ["Evaluaciones", "diagnóstico · post-test · recurrente ·", "calificación en el servidor"],
    ["Assessments", "diagnostic · post-test · recurring ·", "server-side scoring"]
  ));
  node("b4", 1563, 307, 402, 128, C.bll, t(
    ["Aprendizaje y métricas", "ruta · recomendaciones · métricas y", "resumen IA de la empresa"],
    ["Learning and metrics", "path · recommendations · metrics and", "AI summary for the company"]
  ));

  node("d1", 242, 581, 402, 128, C.dal, t(
    ["Clientes Supabase", "supabaseServer · supabaseAdmin ·", "supabaseBrowser"],
    ["Supabase clients", "supabaseServer · supabaseAdmin ·", "supabaseBrowser"]
  ));
  node("d2", 683, 581, 402, 128, C.dal, [t("Historial del chat", "Chat history"), "lib/db.ts"]);
  node("d3", 1123, 581, 402, 128, C.aiFill, t(
    ["Cliente de embeddings", "lib/embedHF.ts · 512 caracteres por entrada"],
    ["Embeddings client", "lib/embedHF.ts · 512 chars per input"]
  ), ai);
  node("d4", 1563, 581, 402, 128, C.aiFill, t(
    ["Cliente del LLM", "llamada HTTP a la API de Groq"],
    ["LLM client", "HTTP call to the Groq API"]
  ), ai);

  node("s1", 242, 855, 549, 145, C.dal, ["Supabase · AWS us-west-2", "PostgreSQL 17 + pgvector · Auth · Storage"], { shape: "cyl" });
  node("s2", 830, 855, 549, 145, C.aiFill, ["Hugging Face Inference", "paraphrase-multilingual-MiniLM-L12-v2 · 384 dim"], ai);
  node("s3", 1416, 855, 549, 145, C.aiFill, ["Groq Cloud", t("openai/gpt-oss-20b · generación de texto", "openai/gpt-oss-20b · text generation")], ai);

  const down = { strokeWidth: 2.5, color: "#000000", exit: [0.552, 1], entry: [0.552, 0] };
  d.edge("ui", "bll", down);
  d.label([1103, 233], "HTTPS · JSON", { size: 19 });
  d.edge("bll", "dal", down);
  d.label([1103, 507], t("llamadas a funciones", "function calls"), { size: 19 });
  d.edge("dal", "ext", down);
  d.label([1103, 781], "HTTPS", { size: 19 });
  d.edge("u2", "d2", {
    dashed: true, color: C.gray, strokeWidth: 1.2, exit: [0.0874, 1], entry: [0.122, 0],
    via: [[878, 234], [664, 234], [664, 508], [732, 508]],
  });
  d.label([722, 491], t("historial del chat · RLS", "chat history · RLS"), { size: 19, color: "#444444" });

  const legend = (x, fill, stroke, label) => {
    d.box(null, x, 1072, 32, 22, { shape: "round", radius: 4, fill, stroke });
    d.text(x + 44, 1069, 300, 28, [label], { size: 19 });
  };
  legend(2, C.white, C.line, t("Presentación", "Presentation"));
  legend(274, C.bll, C.line, t("Lógica de negocio", "Business logic"));
  legend(548, C.dal, C.line, t("Acceso a datos", "Data access"));
  legend(822, C.aiFill, C.navy, t("Inteligencia artificial", "Artificial intelligence"));
  return d;
}

// ============================================================ 4. Flujo RAG
function flujoRag() {
  const d = createDiagram(2000, 1100);
  d.text(3, 6, 900, 40, [`[27]**${t("Flujo RAG de CyberChat", "CyberChat RAG flow")}**`]);

  const phase = (y, h, title) => {
    d.box(null, 2, y, 1996, h, { shape: "round", radius: 16, fill: C.white, stroke: C.soft, layer: "back" });
    d.box(null, 2, y, 1996, 48, { shape: "round", radius: 16, fill: "#f7f7f7", stroke: C.soft, layer: "back", lines: [`**${title}**`], size: 21 });
  };
  phase(65, 285, t("Fase 1 · Indexación (administrador)", "Phase 1 · Indexing (administrator)"));
  phase(430, 618, t("Fase 2 · Consulta (cualquier usuario de la empresa)", "Phase 2 · Query (any user of the company)"));

  const step = (id, x, y, w, h, kind, lines, titleLines = 1) => {
    const style = {
      index: { fill: C.white },
      query: { fill: C.bll },
      ai: { fill: C.aiFill, stroke: C.navy },
      aiExt: { fill: C.aiFill, stroke: C.navy, dashed: true, strokeWidth: 2 },
    }[kind];
    d.box(id, x, y, w, h, { shape: "round", radius: 20, size: 19, lines: lines.map((l, k) => (k < titleLines ? `[21]${l}` : l)), ...style });
  };

  step("i1", 48, 143, 302, 159, "index", t(
    ["Sube el documento", "PDF, DOCX o TXT · máx. 10", "MiB · sin OCR: un PDF", "escaneado sin texto se rechaza"],
    ["Uploads document", "PDF, DOCX or TXT · max. 10", "MiB · no OCR: a scanned PDF", "without text is rejected"]
  ));
  step("i2", 428, 143, 318, 159, "index", t(
    ["Extrae y limpia el texto", "pdf-extraction (PDF) · mammoth", "(DOCX) · UTF-8 (TXT)"],
    ["Extracts and cleans the text", "pdf-extraction (PDF) · mammoth", "(DOCX) · UTF-8 (TXT)"]
  ));
  step("i3", 824, 143, 318, 159, "index", t(
    ["Fragmenta por oraciones", "máximo 800 caracteres por", "fragmento · solape de 1 oración"],
    ["Splits by sentences", "at most 800 characters per", "fragment · 1-sentence overlap"]
  ));
  step("i4", 1236, 143, 302, 159, "aiExt", t(
    ["Genera un embedding", "por fragmento", "Hugging Face · paraphrase-", "multilingual-MiniLM-L12-v2 ·", "384 dim. · solo los primeros", "512 caracteres"],
    ["Generates one embedding", "per fragment", "Hugging Face · paraphrase-", "multilingual-MiniLM-L12-v2 ·", "384 dim. · first 512 characters", "only"]
  ), 2);
  d.box("i5", 1633, 135, 302, 175, {
    shape: "cyl", fill: C.white, size: 19,
    lines: t(
      ["[21]Guarda en Supabase", "archivo en Storage · fragmentos", "y vectores en PostgreSQL con", "pgvector (índice HNSW,", "distancia coseno)"],
      ["[21]Stores in Supabase", "file in Storage · fragments and", "vectors in PostgreSQL with", "pgvector (HNSW index, cosine", "distance)"]
    ),
  });

  step("q1", 48, 508, 302, 159, "query", t(
    ["El usuario pregunta en el chat", "el servidor recibe el historial;", "la búsqueda usa solo el último", "mensaje"],
    ["User asks in the chat", "the server receives the history;", "retrieval uses only the last", "message"]
  ));
  step("q2", 444, 508, 302, 159, "query", t(
    ["Autentica al usuario", "sesión de Supabase Auth · cuenta", "activa · rol y RUC leídos de", "app_metadata"],
    ["Authenticates the user", "Supabase Auth session · active", "account · role and RUC read", "from app_metadata"]
  ));
  step("q3", 840, 508, 302, 159, "aiExt", t(
    ["Genera el embedding", "de la consulta", "mismo modelo que la fase 1 ·", "primeros 512 caracteres"],
    ["Generates the query", "embedding", "same model as phase 1 · first", "512 characters"]
  ), 2);
  step("q4", 1236, 484, 302, 207, "ai", t(
    ["Resuelve la organización", "y busca", "RUC de la sesión → administrador", "dueño (si no existe, usa el id", "del propio usuario) · coseno", "con índice HNSW · 5 candidatos"],
    ["Resolves the organization", "and searches", "session RUC → owning", "administrator (if not found, falls", "back to the user's own id) ·", "cosine with HNSW index · 5", "candidates"]
  ), 2);
  step("q5", 1633, 508, 302, 159, "query", t(
    ["Filtra los resultados", "quita duplicados (primeros 100", "caracteres) · descarta similitud", "< 0.38 · no repone candidatos"],
    ["Filters results", "removes duplicates (first 100", "chars) · discards similarity <", "0.38 · no replenishment of", "candidates"]
  ));
  d.box("q6", 1633, 714, 302, 174, { shape: "diamond", fill: C.bll, size: 21, lines: [t("¿Quedan fragmentos?", "Fragments left?")] });
  step("q7", 1173, 746, 333, 111, "query", t(
    ["Prompt con contexto documental", "fragmentos + reglas de alcance"],
    ["Prompt with document context", "fragments + scope rules"]
  ));
  step("q8", 1173, 889, 333, 127, "query", t(
    ["Prompt de conocimiento general", "responde sin respaldo documental ·", "sugiere subir documentos"],
    ["General-knowledge prompt", "answer without document support ·", "suggests uploading documents"]
  ));
  step("q9", 697, 753, 333, 143, "aiExt", t(
    ["El LLM genera la respuesta", "Groq · openai/gpt-oss-20b · últimos", "12 mensajes · temp. 0.15 · máx. 900", "tokens"],
    ["LLM generates the answer", "Groq · openai/gpt-oss-20b · last 12", "messages · temp. 0.15 · max. 900", "tokens"]
  ));
  step("q10", 207, 762, 333, 127, "query", t(
    ["Respuesta al usuario", "indica si usó contexto ·", "fuentes con % de similitud y", "vista previa (220 caracteres)"],
    ["Answer to the user", "indicates whether it used context ·", "sources with similarity % and", "preview (220 chars)"]
  ));

  const right = { exit: [1, 0.5], entry: [0, 0.5] };
  for (const [a, b] of [["i1", "i2"], ["i2", "i3"], ["i3", "i4"], ["i4", "i5"], ["q1", "q2"], ["q2", "q3"], ["q3", "q4"], ["q4", "q5"]]) d.edge(a, b, right);
  d.edge("i5", "q4", { dashed: true, color: "#444444", strokeWidth: 1.2, via: [[1784, 373], [1387, 373]] });
  d.label([1557, 373], t("base de conocimiento", "knowledge base"), { size: 19 });
  d.edge("q5", "q6");
  d.edge("q6", "q7", { exit: [0, 0.5], entry: [1, 0.5] });
  d.label([1570, 801], t("Sí", "Yes"), { size: 19 });
  d.edge("q6", "q8", { exit: [0.5, 1], entry: [1, 0.5], via: [[1784, 952.5]] });
  d.label([1676, 952], "No", { size: 19 });
  d.edge("q7", "q9", { exit: [0.5, 0], entry: [0.5, 0], via: [[1339.5, 714], [863.5, 714]] });
  d.edge("q8", "q9", { exit: [0, 0.5], entry: [0.5, 1], via: [[863.5, 952.5]] });
  d.edge("q9", "q10", { exit: [0, 0.5], entry: [1, 0.492] });

  const legend = (x, o, label) => {
    d.box(null, x, 1068, 32, 22, { shape: "round", radius: 4, ...o });
    d.text(x + 44, 1065, 620, 28, [label], { size: 19 });
  };
  legend(2, { fill: C.white }, t("Indexación", "Indexing"));
  legend(318, { fill: C.bll }, t("Consulta", "Query"));
  legend(635, { fill: C.aiFill, stroke: C.navy }, t("Paso con IA o búsqueda vectorial", "AI step or vector search"));
  legend(1108, { fill: C.aiFill, stroke: C.navy, dashed: true, strokeWidth: 2 }, t(
    "Envía texto a un servicio externo (Hugging Face o Groq)",
    "Sends text to an external service (Hugging Face or Groq)"
  ));
  return d;
}

// ============================================================ 5. Arquitectura física
function arquitecturaFisica() {
  const d = createDiagram(2000, 990);
  const group = (id, x, y, w, h, title, o = {}) => {
    d.box(id, x, y, w, h, { shape: "round", radius: 16, fill: C.white, stroke: o.stroke ?? C.gray, layer: "back" });
    d.box(null, x, y, w, 48, {
      shape: "round", radius: 16, fill: o.head ?? C.lane, stroke: o.stroke ?? C.gray, layer: "back", lines: [`**${title}**`], size: 21,
    });
  };
  const node = (id, x, y, w, h, lines, o = {}) => d.box(id, x, y, w, h, { shape: "round", radius: 12, size: 21, lines, ...o });

  group("device", 2, 381, 316, 222, t("Dispositivo del usuario", "User device"));
  node("browser", 48, 460, 222, 96, t(["Navegador web", "PC o móvil"], ["Web browser", "PC or mobile"]));

  group("vercel", 445, 287, 412, 412, t("Vercel · nube", "Vercel · cloud"));
  node("edge", 508, 365, 286, 96, t(
    ["Red perimetral", "CDN + middleware (sesión", "y diagnóstico)"],
    ["Edge network", "CDN + middleware (session", "and diagnostic)"]
  ));
  node("fn", 508, 556, 286, 96, t(
    ["Funciones serverless Node.js", "Next.js 16: páginas y API"],
    ["Node.js serverless functions", "Next.js 16: pages and API"]
  ), { size: 20 });

  group("supabase", 1300, 1, 698, 523, "Supabase · AWS us-west-2", { head: "#e6e6e6" });
  node("auth", 1348, 80, 254, 96, t(["Supabase Auth", "usuarios y sesiones"], ["Supabase Auth", "users and sessions"]));
  node("rest", 1348, 238, 254, 96, t(["API REST", "PostgREST"], ["REST API", "PostgREST"]));
  node("pg", 1712, 222, 223, 128, ["PostgreSQL 17", "+ pgvector"], { shape: "cyl" });
  node("storage", 1364, 373, 222, 128, ["Storage", t("bucket documents", "bucket documents")], { shape: "cyl" });

  group("ai", 1300, 635, 698, 206, t("Servicios de IA externos", "External AI services"), { head: C.aiFill, stroke: C.navy });
  node("groq", 1348, 714, 254, 111, ["Groq Cloud", "LLM openai/gpt-oss-20b"], { stroke: C.navy });
  node("hf", 1697, 714, 254, 111, ["Hugging Face Inference", "paraphrase-multilingual-", "MiniLM-L12-v2"], { stroke: C.navy });

  node("github", 540, 889, 222, 95, ["GitHub", t("repositorio", "repository")], { fill: C.lane });

  const big = { size: 21 };
  d.edge("browser", "edge", { exit: [1, 0.5], entry: [0, 0.5], via: [[389, 508], [389, 413]] });
  d.label([389, 460], "HTTPS", big);
  d.edge("browser", "auth", { exit: [0.9, 0], entry: [0, 0.29], via: [[247.8, 107.84]] });
  d.label([622, 108], t("HTTPS · sesión", "HTTPS · session"), big);
  d.edge("browser", "rest", {
    dashed: true, color: C.gray, strokeWidth: 1.2, exit: [0.1, 0], entry: [0, 0.3],
    via: [[70.2, 190], [1268, 190], [1268, 266.8]],
  });
  d.label([612, 190], t("HTTPS · historial del chat (RLS)", "HTTPS · chat history (RLS)"), { size: 21, color: "#444444" });
  d.edge("edge", "fn");
  d.edge("fn", "auth", { exit: [1, 0.24], entry: [0, 0.7], via: [[904, 579.04], [904, 147.2]] });
  d.label([1102, 147], "HTTPS", big);
  d.edge("fn", "rest", { exit: [1, 0.49], entry: [0, 0.5], via: [[976, 603.04], [976, 286]] });
  d.label([1136, 286], t("HTTPS · consultas y RPC", "HTTPS · queries and RPC"), big);
  d.edge("fn", "storage", { exit: [1, 0.74], entry: [0, 0.5], via: [[1047, 627.04], [1047, 437]] });
  d.label([1173, 437], t("HTTPS · archivos", "HTTPS · files"), big);
  d.edge("rest", "pg", { exit: [1, 0.5], entry: [0, 0.5] });
  d.label([1657, 286], "SQL", big);
  d.edge("fn", "groq", { exit: [0.748, 1], entry: [0, 0.43], via: [[721.9, 761.73]] });
  d.label([983, 762], t("HTTPS · respuestas", "HTTPS · responses"), big);
  d.edge("fn", "hf", { exit: [0.248, 1], entry: [0.496, 1], via: [[578.9, 864], [1823, 864]] });
  d.label([1114, 864], "HTTPS · embeddings", big);
  d.edge("github", "vercel", { dashed: true, strokeWidth: 1.2, exit: [0, 0.5], entry: [0, 0.847], via: [[397, 936.5], [397, 636]] });
  d.label([397, 833], t("despliegue", "deployment"), big);
  return d;
}

const DIAGRAMS = {
  "modelo-entidad-relacion": modeloEntidadRelacion,
  "arquitectura-logica-4mas1": arquitecturaLogica,
  "arquitectura-3-capas": arquitectura3Capas,
  "flujo-rag": flujoRag,
  "arquitectura-fisica": arquitecturaFisica,
};

mkdirSync(join(DOCS, "img"), { recursive: true });
for (const [name, build] of Object.entries(DIAGRAMS)) {
  for (const code of ["es", "en"]) {
    lang = code;
    const diagram = build();
    const svg = diagram.toSvg();
    writeFileSync(join(DOCS, code === "es" ? `${name}.drawio` : `${name}.en.drawio`), diagram.toDrawio(name));
    writeFileSync(join(DOCS, "img", `${name}.${code}.svg`), svg);
    await sharp(Buffer.from(svg), { density: 108 }).png().toFile(join(DOCS, "img", `${name}.${code}.png`));
    console.log(`${name} [${code}]`);
  }
}
