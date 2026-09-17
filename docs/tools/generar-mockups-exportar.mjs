// Genera docs/mockups-exportar.html a partir de docs/mockups-cyberchat.html.
//
// La página interactiva es la única fuente: de ahí salen los estilos, el marcado de
// cada pantalla y los datos de ejemplo (preguntas, temas, respuestas del chat). Esta
// salida es estática, sin barra de presentación ni scripts, y con los estados
// relevantes ya aplicados, para capturarla entera con html.to.design.
//
// Uso, desde la raíz del repo:  node docs/tools/generar-mockups-exportar.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DOCS = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(DOCS, "mockups-cyberchat.html");
const OUT = join(DOCS, "mockups-exportar.html");

const src = readFileSync(SRC, "utf8");

function pick(re, what) {
  const m = src.match(re);
  if (!m) throw new Error(`No se encontró ${what} en mockups-cyberchat.html`);
  return m[1];
}
// Los datos son literales de JS dentro del script de la página.
const literal = (name, open, close) =>
  new Function(`return ${pick(new RegExp(`var ${name} = (\\${open}[\\s\\S]*?\\n  \\${close});`), `var ${name}`)}`)();

const style = pick(/<style>([\s\S]*?)<\/style>/, "el bloque <style>");
const fonts = pick(/(<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>)/, "el enlace de fuentes");
const questions = literal("questions", "[", "]");
const topics = literal("topics", "[", "]");
const replies = literal("replies", "[", "]");
const copy = literal("copy", "{", "}");

// Marcado del dispositivo de cada pantalla, sin la cabecera de presentación.
function device(id) {
  const section = pick(new RegExp(`(<section class="screen" id="screen-${id}"[\\s\\S]*?</section>)`), `la pantalla ${id}`);
  const body = section.match(/(<div class="stage">[\s\S]*)<\/section>/);
  if (!body) throw new Error(`La pantalla ${id} no tiene <div class="stage">`);
  return body[1].trim();
}

function replaceOrFail(html, from, to, what) {
  const next = html.replace(from, to);
  if (next === html) throw new Error(`No se pudo aplicar: ${what}`);
  return next;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Mismo marcado que renderQuestions() de la página interactiva.
function renderQuestions(answers, submitted) {
  return questions.map((q, qi) => {
    const tag = !submitted ? "" : answers[qi] === q.correct
      ? '<span class="badge bajo">Correcta</span>'
      : '<span class="badge alto">Revisar</span>';
    const opts = q.o.map((o, oi) => {
      let cls = "opt";
      if (submitted && oi === q.correct) cls += " correct";
      else if (submitted && oi === answers[qi]) cls += " wrong";
      return `<button class="${cls}" aria-pressed="${!submitted && answers[qi] === oi}"${submitted ? " disabled" : ""}>` +
        `<span class="l">${"ABCD"[oi]}</span><span>${esc(o)}</span></button>`;
    }).join("");
    return `<article class="q"><div class="q-head"><div><p class="eyebrow">Pregunta ${qi + 1} · ${esc(q.topic)}</p>` +
      `<h3>${esc(q.q)}</h3></div>${tag}</div><div class="opts">${opts}</div>` +
      (submitted ? `<div class="explain">${esc(q.exp)}</div>` : "") + "</article>";
  }).join("");
}

function renderTopics() {
  return topics.map(([name, pct]) => {
    const cls = pct >= 75 ? "hi" : pct >= 50 ? "mid" : "lo";
    return `<div class="topic"><span class="name" title="${esc(name)}">${esc(name)}</span>` +
      `<div class="bar"><span class="${cls}" style="width:${pct}%"></span></div><b class="num">${pct} %</b></div>`;
  }).join("") +
    '<div class="scale" aria-hidden="true"><span></span><span><span>0</span><span>50</span><span>100 %</span></span><span></span></div>';
}

const bot = (r) => `<div class="msg bot">${r.html}` +
  (r.sources.length ? `<div class="sources">${r.sources.map((s) => `<span class="source">📄 ${esc(s)}</span>`).join("")}</div>` : "") +
  "</div>";

// ───── Estados ─────

const login = replaceOrFail(device("login"),
  /\s*<p class="muted"[^>]*>Prueba:[\s\S]*?<\/p>/, "", "quitar la ayuda de prueba del login");

const regEmpresa = device("register");

let regColab = device("register");
const c = copy.colaborador;
regColab = regColab
  .replace(/data-only="colaborador" hidden/g, 'data-only="colaborador"')
  .replace(/data-only="empresa"(?! hidden)/g, 'data-only="empresa" hidden')
  .replace('aria-pressed="true" data-mode="empresa"', 'aria-pressed="false" data-mode="empresa"')
  .replace('aria-pressed="false" data-mode="colaborador"', 'aria-pressed="true" data-mode="colaborador"');
regColab = replaceOrFail(regColab, /(id="reg-eyebrow">)[^<]*/, `$1${c.eyebrow}`, "etiqueta del registro");
regColab = replaceOrFail(regColab, /(id="reg-submit">)[^<]*/, `$1${c.submit}`, "botón del registro");
regColab = replaceOrFail(regColab, /(id="reg-title">)[\s\S]*?(<\/h2>)/, `$1${c.title}$2`, "título del registro");
regColab = replaceOrFail(regColab, /(id="reg-lead">)[^<]*/, `$1${c.lead}`, "bajada del registro");
regColab = replaceOrFail(regColab, /(id="reg-step1">)[^<]*/, `$1${c.s1[0]}`, "paso 1");
regColab = replaceOrFail(regColab, /(id="reg-step1d">)[^<]*/, `$1${c.s1[1]}`, "detalle paso 1");
regColab = replaceOrFail(regColab, /(id="reg-step2">)[^<]*/, `$1${c.s2[0]}`, "paso 2");
regColab = replaceOrFail(regColab, /(id="reg-step2d">)[^<]*/, `$1${c.s2[1]}`, "detalle paso 2");

const chatInicio = device("chat");

const q1 = "¿Cuáles son las amenazas de ciberseguridad más comunes para una MYPE peruana?";
const q2 = "Dame un plan rápido de 5 pasos para mejorar la ciberseguridad de mi empresa.";
let chatConv = device("chat");
chatConv = replaceOrFail(chatConv, '<div class="welcome" id="chat-welcome">',
  '<div class="welcome" id="chat-welcome" hidden>', "ocultar la bienvenida");
chatConv = replaceOrFail(chatConv, '<div class="thread" id="chat-thread" hidden></div>',
  `<div class="thread" id="chat-thread"><div class="msg user">${esc(q1)}</div>${bot(replies[0])}` +
  `<div class="msg user">${esc(q2)}</div>${bot(replies[1])}</div>`, "insertar la conversación");
chatConv = replaceOrFail(chatConv, /(id="chat-count">)0/, "$12", "contador de consultas");
chatConv = replaceOrFail(chatConv, "<b>Nueva conversación</b><span>Ahora</span>",
  `<b>${esc(q1.slice(0, 40))}</b><span>Ahora · 4 mensajes</span>`, "título de la conversación");

let evalCurso = device("eval");
evalCurso = replaceOrFail(evalCurso, 'id="eval-questions"></div>',
  `id="eval-questions">${renderQuestions([1, 2, -1, -1], false)}</div>`, "preguntas en curso");
evalCurso = replaceOrFail(evalCurso, /(id="eval-progress">)0\/4/, "$12/4", "progreso en curso");
evalCurso = replaceOrFail(evalCurso, 'id="eval-bar" style="width:0%"', 'id="eval-bar" style="width:50%"', "barra en curso");

const answers = [1, 0, 3, 0];
const score = questions.reduce((n, q, i) => n + (answers[i] === q.correct ? 1 : 0), 0);
const total = questions.length;
const verdict = score === total
  ? "Muy buen nivel. Mantén estas prácticas y comparte el aprendizaje con tu equipo."
  : score >= Math.ceil(total * 0.6)
    ? "Vas bien, pero todavía hay puntos por reforzar. Revisa las explicaciones y vuelve a intentarlo."
    : "Conviene reforzar conceptos básicos. Revisa las explicaciones y conversa sobre estos temas con el asistente.";
let evalRes = device("eval");
evalRes = replaceOrFail(evalRes, 'id="eval-questions"></div>',
  `id="eval-questions">${renderQuestions(answers, true)}</div>`, "preguntas calificadas");
evalRes = replaceOrFail(evalRes, /(id="eval-progress">)0\/4/, `$1${score}/${total}`, "nota");
evalRes = replaceOrFail(evalRes, 'id="eval-bar" style="width:0%"',
  `id="eval-bar" style="width:${(score / total) * 100}%"`, "barra de nota");
evalRes = replaceOrFail(evalRes, /(id="eval-progress-note">)[^<]*/, "$1Resultado final de tu evaluación.", "nota del progreso");
evalRes = replaceOrFail(evalRes, /<div class="panel eval-foot" id="eval-foot">[\s\S]*?<\/div>/,
  `<div class="panel eval-foot" id="eval-foot"><div class="result"><h3>Obtuviste ${score} de ${total}</h3>` +
  `<p class="soft" style="margin:0">${verdict}</p></div><div class="controls">` +
  '<button class="btn ghost">Reiniciar test</button><button class="btn primary">Volver al chat</button></div></div>',
  "pie de resultados");

const dash = replaceOrFail(device("dash"), 'id="dash-topics"></div>',
  `id="dash-topics">${renderTopics()}</div>`, "barras por tema");

const frames = [
  ["01", "Inicio de sesión", "/login", login],
  ["02", "Registro · Empresa", "/register/admin", regEmpresa],
  ["03", "Registro · Colaborador", "/register/employee", regColab],
  ["04", "Chat con IA · Inicio", "/chat", chatInicio],
  ["05", "Chat con IA · Conversación", "/chat", chatConv],
  ["06", "Evaluación · En curso", "/chat · Evaluaciones", evalCurso],
  ["07", "Evaluación · Resultados", "/chat · Evaluaciones", evalRes],
  ["08", "Dashboard organizacional", "/org-dashboard", dash],
];

const exportCss = `
  /* Vista estática para capturar: todo a altura completa y sin desplazamiento
     interno, porque una captura solo toma lo visible de cada contenedor. */
  body { min-width: 1320px; }
  .export-page { max-width: 1320px; margin: 0 auto; padding: 40px 24px 80px; display: grid; gap: 64px; }
  .frame-label { display: flex; align-items: baseline; gap: 14px; margin: 0 0 14px; }
  .frame-label .n { font-family: var(--font-mono); font-size: 12px; color: var(--amber-dim); }
  .frame-label b { font-family: var(--font-display); font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
  .frame-label .route { margin-left: auto; }
  .stage { overflow: visible; }
  .device { height: auto; min-height: 800px; }
  .auth, .app, .content { height: auto; min-height: 800px; }
  .scroll, .convs, .auth-panel { overflow: visible; }
`;

const html = `<meta charset="utf-8">
<title>CyberChat Exportable</title>
<!-- Archivo generado por docs/tools/generar-mockups-exportar.mjs a partir de
     docs/mockups-cyberchat.html. No editar a mano: editar la fuente y regenerar. -->
${fonts}
<style>${style}${exportCss}</style>

<main class="export-page">
${frames.map(([n, name, route, body]) => `  <section class="frame">
    <div class="frame-label"><span class="n">${n}</span><b>${name}</b><span class="route">${route}</span></div>
    ${body}
  </section>`).join("\n\n")}
</main>
`;

writeFileSync(OUT, html, "utf8");
console.log(`Generado ${OUT} · ${frames.length} marcos · ${(html.length / 1024).toFixed(0)} KB · nota de la evaluación ${score}/${total}`);
