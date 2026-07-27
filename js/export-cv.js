/**
 * Export CV — thème « ATS Clean » : 1 colonne, 1 page, zéro branding.
 * Contenu structuré via parse-cv (pas de dump mur de texte).
 */
import { parseCv } from "./parse-cv.js";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const SECTION_TITLES = {
  fr: {
    summary: "Profil",
    experience: "Expérience",
    education: "Formation",
    skills: "Compétences",
    languages: "Langues",
    other: "Autres",
  },
  en: {
    summary: "Profile",
    experience: "Experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    other: "Other",
  },
};

/**
 * Parse grossier du texte optimisé en sections (compat / fallback).
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
    /exp[ée]rience|formation|comp[ée]tences?|langues?|profil|r[ée]sum[ée]|parcours|skills|education|languages|objective|recommandations?/i;
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

    if (
      isHeading ||
      (/^(exp[ée]rience|formation|comp[ée]tences?|langues?|profil)\b/i.test(trimmed) &&
        trimmed.length < 60)
    ) {
      headerDone = true;
      const lower = trimmed.toLowerCase();
      if (/exp[ée]rience|parcours|emploi|career|work/.test(lower)) current = "experience";
      else if (/formation|education|dipl[ôo]me|études/.test(lower)) current = "education";
      else if (/comp[ée]tence|skills|savoir|technologie|outil/.test(lower)) current = "skills";
      else if (/langue|language/.test(lower)) current = "languages";
      else if (/profil|r[ée]sum[ée]|objectif|about|synth/.test(lower)) current = "summary";
      else current = "other";
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

/**
 * Construit un modèle de layout CV depuis texte (+ parse optionnel).
 * Compresse vers ~1 page (rôles anciens raccourcis).
 */
export function buildCvModel(optimizedText, parsedIn = null, meta = {}) {
  const text = optimizedText || "";
  const parsed = parsedIn || parseCv(text);
  const flat = parseCvSections(text);
  const lang = meta.lang === "en" ? "en" : "fr";

  const name =
    parsed.contact?.name ||
    flat.header.find((l) => l.length > 2 && l.length < 60 && !/@/.test(l) && !/\d{2}/.test(l)) ||
    flat.header[0] ||
    "Curriculum Vitae";

  const title =
    flat.header.find(
      (l) =>
        l !== name &&
        l.length > 3 &&
        l.length < 80 &&
        !/@/.test(l) &&
        !/linkedin|http|tel|\+?\d[\d\s.\-]{7,}/i.test(l)
    ) ||
    parsed.roles?.[0]?.title ||
    "";

  const contactParts = [
    parsed.contact?.email,
    parsed.contact?.phone,
    parsed.contact?.linkedin,
  ].filter(Boolean);
  if (!contactParts.length) {
    for (const l of flat.header.slice(1)) {
      if (/@|linkedin|\+?\d/.test(l)) contactParts.push(l);
    }
  }

  const summaryLines = (flat.summary?.length ? flat.summary : parsed.sections?.summary || [])
    .filter((l) => l && !/^profil$/i.test(l.trim()))
    .slice(0, 4);

  // Roles from structured parse preferred; else reconstruct from flat experience lines
  let roles = (parsed.roles || []).map((r) => ({
    title: r.title,
    company: r.company,
    startYear: r.startYear,
    endYear: r.endYear,
    ongoing: r.ongoing,
    bullets: (r.bullets || []).slice(0, 5),
  }));

  if (!roles.length && flat.experience?.length) {
    roles = rolesFromFlatLines(flat.experience);
  }

  // Soft 1-page compression: keep recent roles fuller, trim older
  const maxRoles = 4;
  if (roles.length > maxRoles) {
    roles = roles.slice(0, maxRoles - 1).concat(
      roles.slice(maxRoles - 1).map((r) => ({
        ...r,
        bullets: (r.bullets || []).slice(0, 1),
      }))
    );
  } else {
    roles = roles.map((r, i) => ({
      ...r,
      bullets: (r.bullets || []).slice(0, i < 2 ? 5 : 3),
    }));
  }

  let education = (parsed.educationRoles || []).map((r) => ({
    title: r.title || r.raw,
    company: r.company,
    startYear: r.startYear,
    endYear: r.endYear,
  }));
  if (!education.length) {
    education = (flat.education || [])
      .filter((l) => l && !/^formation/i.test(l))
      .slice(0, 4)
      .map((l) => ({ title: l, company: "", startYear: null, endYear: null }));
  }
  education = education.slice(0, 3);

  const skills =
    (parsed.skills?.length ? parsed.skills : extractSkillsFromFlat(flat.skills)).slice(0, 18);

  const languages = (flat.languages || parsed.sections?.languages || [])
    .filter((l) => l && !/^langues?/i.test(l))
    .slice(0, 6);

  const other = (flat.other || [])
    .filter(Boolean)
    .slice(0, 6);

  const order =
    parsed.sectionOrder?.filter((k) => k !== "header").length > 0
      ? parsed.sectionOrder.filter((k) => k !== "header")
      : ["summary", "experience", "education", "skills", "languages", "other"];

  return {
    lang,
    name,
    title,
    contactLine: contactParts.join(" · "),
    summaryLines,
    roles,
    education,
    skills,
    languages,
    other,
    order,
    titles: SECTION_TITLES[lang],
  };
}

function rolesFromFlatLines(lines) {
  const roles = [];
  let cur = null;
  for (const line of lines) {
    if (!line) continue;
    const isBullet = /^[-•●▪–—*]\s+/.test(line);
    if (isBullet) {
      if (!cur) cur = { title: "", company: "", bullets: [], startYear: null, endYear: null, ongoing: false };
      cur.bullets.push(line.replace(/^[-•●▪–—*]\s+/, "").trim());
      continue;
    }
    if (cur) roles.push(cur);
    const parts = line.split(/\s+[—–\-]\s+/);
    cur = {
      title: parts[0] || line,
      company: parts[1] || "",
      bullets: [],
      startYear: null,
      endYear: null,
      ongoing: false,
    };
  }
  if (cur) roles.push(cur);
  return roles;
}

function extractSkillsFromFlat(lines) {
  const out = [];
  for (const line of lines || []) {
    const parts = String(line)
      .split(/[,;|•·]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1 && s.length < 48);
    if (parts.length > 1) out.push(...parts);
    else if (line?.trim()) out.push(line.replace(/^[-•]\s+/, "").trim());
  }
  return [...new Set(out)];
}

function formatYears(role) {
  if (!role.startYear && !role.endYear) return "";
  const end = role.ongoing
    ? "Présent"
    : role.endYear || "";
  if (role.startYear && end) return `${role.startYear} – ${end}`;
  return String(role.startYear || end);
}

function renderRole(role) {
  const years = formatYears(role);
  const head = [role.title, role.company].filter(Boolean).join(" — ");
  const bullets = (role.bullets || [])
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("");
  return `<article class="cv-role">
  <div class="cv-role-head">
    <p class="cv-role-title">${escapeHtml(head)}</p>
    ${years ? `<p class="cv-role-dates">${escapeHtml(years)}</p>` : ""}
  </div>
  ${bullets ? `<ul>${bullets}</ul>` : ""}
</article>`;
}

function renderEdu(item) {
  const years = formatYears(item);
  const head = [item.title, item.company].filter(Boolean).join(" — ");
  return `<p class="cv-edu"><span class="cv-edu-title">${escapeHtml(head)}</span>${
    years ? ` <span class="cv-role-dates">${escapeHtml(years)}</span>` : ""
  }</p>`;
}

/**
 * HTML imprimable — thème ATS Clean, aucune signature outil.
 */
export function buildCleanHtml(optimizedText, parsed = null, meta = {}) {
  const model = buildCvModel(optimizedText, parsed, meta);
  const printLabel = model.lang === "en" ? "Print / PDF" : "Imprimer / PDF";
  const docTitle = model.name || "CV";

  const sections = [];
  for (const key of model.order) {
    if (key === "summary" && model.summaryLines.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.summary)}</h2>
        ${model.summaryLines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n")}
      </section>`);
    } else if (key === "experience" && model.roles.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.experience)}</h2>
        ${model.roles.map(renderRole).join("\n")}
      </section>`);
    } else if (key === "education" && model.education.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.education)}</h2>
        ${model.education.map(renderEdu).join("\n")}
      </section>`);
    } else if (key === "skills" && model.skills.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.skills)}</h2>
        <p class="cv-skills">${escapeHtml(model.skills.join(" · "))}</p>
      </section>`);
    } else if (key === "languages" && model.languages.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.languages)}</h2>
        <p>${escapeHtml(model.languages.join(" · "))}</p>
      </section>`);
    } else if (key === "other" && model.other.length) {
      sections.push(`<section class="cv-sec"><h2>${escapeHtml(model.titles.other)}</h2>
        ${model.other.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n")}
      </section>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="${model.lang}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(docTitle)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Source Sans 3", "Helvetica Neue", Arial, sans-serif;
    color: #1c1917;
    line-height: 1.35;
    max-width: 210mm;
    margin: 0 auto;
    padding: 12mm 14mm;
    font-size: 9.75pt;
    background: #fff;
  }
  h1 {
    font-family: "Source Serif 4", Georgia, serif;
    font-size: 20pt;
    font-weight: 700;
    margin: 0 0 0.15rem;
    letter-spacing: -0.01em;
    line-height: 1.15;
  }
  .cv-headline {
    font-size: 10.5pt;
    font-weight: 600;
    color: #44403c;
    margin: 0 0 0.35rem;
  }
  .cv-contact {
    font-size: 8.75pt;
    color: #57534e;
    margin: 0;
  }
  .cv-header {
    margin-bottom: 0.65rem;
    padding-bottom: 0.5rem;
    border-bottom: 1.5px solid #1c1917;
  }
  .cv-sec { margin: 0.55rem 0 0.35rem; }
  .cv-sec h2 {
    font-family: "Source Sans 3", sans-serif;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid #d6d3d1;
    padding-bottom: 0.15rem;
    margin: 0 0 0.35rem;
    color: #1c1917;
  }
  .cv-sec p { margin: 0.15rem 0; }
  .cv-role { margin: 0 0 0.4rem; }
  .cv-role-head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }
  .cv-role-title { font-weight: 600; margin: 0; font-size: 9.75pt; }
  .cv-role-dates {
    font-size: 8.5pt;
    color: #57534e;
    white-space: nowrap;
    margin: 0;
    flex-shrink: 0;
  }
  .cv-sec ul {
    margin: 0.15rem 0 0 1rem;
    padding: 0;
  }
  .cv-sec li { margin: 0.08rem 0; }
  .cv-skills { margin: 0; }
  .cv-edu { margin: 0.12rem 0; }
  .cv-edu-title { font-weight: 600; }
  .no-print button {
    font: inherit;
    padding: 0.5rem 0.9rem;
    cursor: pointer;
    border: 1px solid #d6d3d1;
    border-radius: 0.4rem;
    background: #fafaf9;
  }
  @media print {
    body { padding: 0; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="no-print" style="margin-bottom:0.75rem">
    <button type="button" onclick="window.print()">${escapeHtml(printLabel)}</button>
  </div>
  <header class="cv-header">
    <h1>${escapeHtml(model.name)}</h1>
    ${model.title ? `<p class="cv-headline">${escapeHtml(model.title)}</p>` : ""}
    ${model.contactLine ? `<p class="cv-contact">${escapeHtml(model.contactLine)}</p>` : ""}
  </header>
  ${sections.join("\n")}
</body>
</html>`;
}

/** @deprecated Use buildCleanHtml — kept as alias for linear ATS export */
export function buildAtsHtml(optimizedText, meta = {}) {
  return buildCleanHtml(optimizedText, meta.parsed || null, meta);
}

export function downloadAtsHtml(optimizedText, meta = {}) {
  const html = buildCleanHtml(optimizedText, meta.parsed || null, meta);
  triggerHtmlDownload(html, meta.fileName, "cv");
  return html;
}

export function downloadCleanHtml(optimizedText, parsed, meta = {}) {
  const html = buildCleanHtml(optimizedText, parsed, meta);
  triggerHtmlDownload(html, meta.fileName, "cv");
  return html;
}

export function openPrintableCv(optimizedText, meta = {}) {
  const html = buildCleanHtml(optimizedText, meta.parsed || null, meta);
  const w = window.open("", "_blank");
  if (!w) return html;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return html;
}

export function openCleanPrintable(optimizedText, parsed, meta = {}) {
  const html = buildCleanHtml(optimizedText, parsed, meta);
  const w = window.open("", "_blank");
  if (!w) return html;
  w.document.open();
  w.document.write(html);
  w.document.close();
  return html;
}

function triggerHtmlDownload(html, fileName, suffix) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = String(fileName || "cv").replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}-${suffix}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
