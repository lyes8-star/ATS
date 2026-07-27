/**
 * Export CV ATS 1 colonne (HTML imprimable).
 */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Parse grossier du texte optimisé en sections.
 */
export function parseCvSections(text) {
  const lines = (text || "").split(/\n/).map((l) => l.trimEnd());
  const sections = {
    header: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    languages: [],
    other: [],
  };

  const headerRe =
    /exp[ée]rience|formation|comp[ée]tences?|langues?|profil|r[ée]sum[ée]|parcours|skills|education|languages|objective/i;
  let current = "header";
  let headerDone = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current !== "header") sections[current].push("");
      continue;
    }
    const isHeading =
      trimmed === trimmed.toUpperCase() &&
      trimmed.length < 48 &&
      headerRe.test(trimmed);

    if (isHeading || (/^(exp[ée]rience|formation|comp[ée]tences?|langues?|profil)\b/i.test(trimmed) && trimmed.length < 60)) {
      headerDone = true;
      const lower = trimmed.toLowerCase();
      if (/exp[ée]rience|parcours|emploi|career|work/.test(lower)) current = "experience";
      else if (/formation|education|dipl[ôo]me|études/.test(lower)) current = "education";
      else if (/comp[ée]tence|skills|savoir|technologie|outil/.test(lower)) current = "skills";
      else if (/langue|language/.test(lower)) current = "languages";
      else if (/profil|r[ée]sum[ée]|objectif|about|synth/.test(lower)) current = "summary";
      else current = "other";
      sections[current].push(trimmed);
      continue;
    }

    if (!headerDone && sections.header.length < 8) {
      sections.header.push(trimmed);
    } else {
      if (!headerDone) {
        headerDone = true;
        current = "other";
      }
      sections[current].push(trimmed);
    }
  }

  return sections;
}

function renderSection(title, lines) {
  if (!lines?.length) return "";
  const body = lines
    .filter((l, i) => !(i === 0 && l.toUpperCase() === title.toUpperCase()))
    .map((l) => {
      if (!l) return "";
      if (/^[-•*]/.test(l)) return `<li>${escapeHtml(l.replace(/^[-•*]\s*/, ""))}</li>`;
      return `<p>${escapeHtml(l)}</p>`;
    })
    .join("\n");
  const hasList = /<li>/.test(body);
  const content = hasList
    ? body.replace(/(?:<p>.*?<\/p>\n?)+/g, (m) => m) // keep mixed
    : body;
  // Wrap consecutive li
  const wrapped = content.includes("<li>")
    ? content
        .replace(/(<li>[\s\S]*?<\/li>(?:\n)?)+/g, (block) => `<ul>${block}</ul>`)
    : content;
  return `<section class="cv-sec"><h2>${escapeHtml(title)}</h2>${wrapped || content}</section>`;
}

/**
 * @param {string} optimizedText
 * @param {{ fileName?: string, scoreBefore?: number, scoreAfter?: number }} meta
 * @returns {string} HTML document
 */
export function buildAtsHtml(optimizedText, meta = {}) {
  const sections = parseCvSections(optimizedText);
  const headerHtml = sections.header.map((l) => `<p class="cv-line">${escapeHtml(l)}</p>`).join("\n");

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>CV ATS — ${escapeHtml(meta.fileName || "optimisé")}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @page { margin: 1.4cm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    line-height: 1.45;
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem;
    font-size: 11pt;
  }
  h1 { font-size: 1.6rem; margin: 0 0 0.35rem; }
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
  @media print {
    body { padding: 0; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:1rem">
    <button onclick="window.print()" style="padding:0.6rem 1rem;font-size:1rem;cursor:pointer">Imprimer / PDF</button>
  </div>
  <header class="cv-header">
    ${headerHtml || "<p class=\"cv-line\">CV ATS optimisé</p>"}
  </header>
  ${renderSection("Profil", sections.summary)}
  ${renderSection("Expérience professionnelle", sections.experience)}
  ${renderSection("Formation", sections.education)}
  ${renderSection("Compétences", sections.skills)}
  ${renderSection("Langues", sections.languages)}
  ${sections.other.length ? renderSection("Autres", sections.other) : ""}
  <p class="meta no-print">Généré par ATS Check${
    meta.scoreBefore != null && meta.scoreAfter != null
      ? ` — score ${meta.scoreBefore} → ${meta.scoreAfter}`
      : ""
  } · mise en page 1 colonne compatible ATS</p>
</body>
</html>`;
  return html;
}

/**
 * Télécharge le HTML ATS.
 */
export function downloadAtsHtml(optimizedText, meta = {}) {
  const html = buildAtsHtml(optimizedText, meta);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = (meta.fileName || "cv").replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}-ats-optimise.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return html;
}

/**
 * Ouvre le CV dans un nouvel onglet pour impression / PDF.
 */
export function openPrintableCv(optimizedText, meta = {}) {
  const html = buildAtsHtml(optimizedText, meta);
  const w = window.open("", "_blank");
  if (!w) return html;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return html;
}
