/**
 * Reconstruction HTML/DOCX fidèle à la structure détectée (chemin PDF).
 * Conserve l'ordre des sections / titres / puces du parse structuré.
 */
import { parseCvSections } from "./export-cv.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SECTION_TITLES = {
  fr: {
    summary: "Profil",
    experience: "Expérience professionnelle",
    education: "Formation",
    skills: "Compétences",
    languages: "Langues",
    other: "Autres",
  },
  en: {
    summary: "Summary",
    experience: "Work experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    other: "Other",
  },
};

/**
 * Construit un HTML qui reprend l'ordre des sections du parse structuré.
 * @param {string} optimizedText
 * @param {object|null} parsed
 * @param {object} [meta]
 */
export function buildFaithfulHtml(optimizedText, parsed, meta = {}) {
  const lang = meta.lang === "en" ? "en" : "fr";
  const titles = SECTION_TITLES[lang];
  const order =
    parsed?.sectionOrder?.length > 0
      ? parsed.sectionOrder
      : ["summary", "experience", "education", "skills", "languages", "other"];

  // Prefer applying optimized text through section re-parse, then reorder
  const flat = parseCvSections(optimizedText || "");
  const headerLines =
    (parsed?.contact &&
      [
        parsed.contact.name,
        [parsed.contact.email, parsed.contact.phone, parsed.contact.linkedin].filter(Boolean).join(" | "),
      ].filter(Boolean)) ||
    flat.header;

  // If optimized text has content for a section, use it; else fall back to parsed lines
  const bodyFor = (key) => {
    if (flat[key]?.length) return flat[key];
    return parsed?.sections?.[key] || [];
  };

  const headerHtml = (headerLines || [])
    .filter(Boolean)
    .map((l, i) =>
      i === 0
        ? `<h1>${escapeHtml(l)}</h1>`
        : `<p class="cv-line">${escapeHtml(l)}</p>`
    )
    .join("\n");

  const sectionsHtml = order
    .filter((k) => k !== "header")
    .map((k) => renderSection(titles[k] || k, bodyFor(k)))
    .join("\n");

  const risk =
    meta.layoutHostile || parsed?.layout?.columnSmell || parsed?.layout?.tableHint
      ? `<aside class="ats-risk no-print" role="note"><strong>${
          lang === "en" ? "ATS layout risk" : "Risque ATS"
        }</strong> — ${
          lang === "en"
            ? "The original layout may use columns or tables. A linear ATS version is also available from the studio."
            : "La mise en page d'origine peut contenir colonnes ou tableaux. Une version ATS linéaire est aussi disponible dans l'atelier."
        }</aside>`
      : "";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>CV — ${escapeHtml(meta.fileName || "optimisé")}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 1.4cm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Source Sans 3", "Segoe UI", Georgia, serif;
    color: #1a1a1a;
    line-height: 1.45;
    max-width: 780px;
    margin: 0 auto;
    padding: 1.5rem;
    font-size: 11pt;
    background: linear-gradient(180deg, #f7f5f1 0%, #fff 40%);
  }
  h1 { font-size: 1.55rem; margin: 0 0 0.35rem; font-weight: 700; }
  .cv-header { margin-bottom: 1.25rem; border-bottom: 2px solid #222; padding-bottom: 0.75rem; }
  .cv-line { margin: 0.15rem 0; }
  .cv-sec { margin: 1rem 0; }
  .cv-sec h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #ccc;
    padding-bottom: 0.25rem;
    margin: 0 0 0.5rem;
  }
  .cv-sec p { margin: 0.25rem 0; }
  .cv-sec ul { margin: 0.25rem 0 0.5rem 1.1rem; padding: 0; }
  .cv-sec li { margin: 0.15rem 0; }
  .meta { color: #666; font-size: 0.8rem; margin-top: 2rem; }
  .ats-risk {
    background: #fff8e6;
    border-left: 3px solid #d4a017;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  @media print {
    body { padding: 0; max-width: none; background: #fff; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:1rem">
    <button onclick="window.print()" style="padding:0.6rem 1rem;font-size:1rem;cursor:pointer">${
      lang === "en" ? "Print / PDF" : "Imprimer / PDF"
    }</button>
  </div>
  ${risk}
  <header class="cv-header">
    ${headerHtml || `<p class="cv-line">${lang === "en" ? "Optimized CV" : "CV optimisé"}</p>`}
  </header>
  ${sectionsHtml}
  <p class="meta no-print">ATS Check — ${
    lang === "en" ? "structure-preserving reconstruction" : "reconstruction fidèle à la structure"
  }${
    meta.scoreBefore != null && meta.scoreAfter != null
      ? ` · score ${meta.scoreBefore} → ${meta.scoreAfter}`
      : ""
  }</p>
</body>
</html>`;
}

function renderSection(title, lines) {
  if (!lines?.length) return "";
  const body = lines
    .filter((l, i) => !(i === 0 && String(l).toUpperCase() === title.toUpperCase()))
    .map((l) => {
      if (!l) return "";
      if (/^[-•*]/.test(l)) return `<li>${escapeHtml(l.replace(/^[-•*]\s*/, ""))}</li>`;
      return `<p>${escapeHtml(l)}</p>`;
    })
    .join("\n");
  const wrapped = body.includes("<li>")
    ? body.replace(/(<li>[\s\S]*?<\/li>(?:\n)?)+/g, (block) => `<ul>${block}</ul>`)
    : body;
  return `<section class="cv-sec"><h2>${escapeHtml(title)}</h2>${wrapped}</section>`;
}

export function downloadFaithfulHtml(optimizedText, parsed, meta = {}) {
  const html = buildFaithfulHtml(optimizedText, parsed, meta);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = String(meta.fileName || "cv").replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}-optimise.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return html;
}

export function openFaithfulPrintable(optimizedText, parsed, meta = {}) {
  const html = buildFaithfulHtml(optimizedText, parsed, meta);
  const w = window.open("", "_blank");
  if (!w) return html;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return html;
}

/**
 * DOCX reconstruit via lib `docx` (CDN), ordre des sections préservé.
 */
export async function downloadReconstructedDocx(optimizedText, parsed, meta = {}) {
  await ensureDocxLib();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;
  const lang = meta.lang === "en" ? "en" : "fr";
  const titles = SECTION_TITLES[lang];
  const flat = parseCvSections(optimizedText || "");
  const order =
    parsed?.sectionOrder?.length > 0
      ? parsed.sectionOrder
      : ["summary", "experience", "education", "skills", "languages", "other"];

  const children = [];
  const header =
    flat.header?.length
      ? flat.header
      : [parsed?.contact?.name, parsed?.contact?.email].filter(Boolean);

  header.forEach((line, i) => {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: line, bold: i === 0, size: i === 0 ? 28 : 20 })],
        spacing: { after: 80 },
      })
    );
  });

  for (const key of order) {
    if (key === "header") continue;
    const lines = flat[key]?.length ? flat[key] : parsed?.sections?.[key] || [];
    if (!lines.length) continue;
    children.push(
      new Paragraph({
        text: titles[key] || key,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
      })
    );
    for (const line of lines) {
      if (!line) continue;
      if (String(line).toUpperCase() === String(titles[key] || "").toUpperCase()) continue;
      const isBullet = /^[-•*]/.test(line);
      children.push(
        new Paragraph({
          children: [new TextRun(isBullet ? line.replace(/^[-•*]\s*/, "") : line)],
          bullet: isBullet ? { level: 0 } : undefined,
          spacing: { after: 60 },
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = String(meta.fileName || "cv").replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}-optimise.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob;
}

let docxLoading = null;
function ensureDocxLib() {
  if (window.docx?.Document) return Promise.resolve();
  if (docxLoading) return docxLoading;
  docxLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger la lib docx"));
    document.head.appendChild(s);
  });
  return docxLoading;
}

/**
 * Export principal layout-fidèle selon le format source.
 * @param {object} session
 * @param {object} [meta]
 */
export async function downloadLayoutFaithful(session, meta = {}) {
  const format = session.extracted?.format;
  const opts = {
    fileName: meta.fileName || session.originalFile?.name,
    scoreBefore: meta.scoreBefore ?? session.scoreBefore,
    scoreAfter: meta.scoreAfter ?? session.retestReport?.total,
    lang: meta.lang || window.ATSi18n?.getLang?.() || "fr",
    layoutHostile: session.report?.layoutHostile,
  };
  if (format === "docx") {
    const { downloadOptimizedDocx } = await import("./export-docx.js");
    return downloadOptimizedDocx(session, opts);
  }
  // PDF / txt / html → HTML reconstruit (+ DOCX reconstruit en parallèle optionnel)
  downloadFaithfulHtml(session.optimizedText, session.report?.parsed, opts);
  try {
    await downloadReconstructedDocx(session.optimizedText, session.report?.parsed, opts);
  } catch (err) {
    console.warn("DOCX reconstruct skipped", err);
  }
  return { usedFallback: false };
}
