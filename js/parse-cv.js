/**
 * Parse structuré CV — lignes, sections, rôles, dates, contact.
 * Algo type Open-Resume adapté FR/EN, 100 % client.
 */

const SECTION_HEADERS = [
  { key: "experience", re: /^(exp[ée]riences?(?:\s+professionnelles?)?|parcours(?:\s+professionnel)?|emploi|career|work\s+experience|professional\s+experience|expériences?)$/i },
  { key: "education", re: /^(formations?|education|éducation|dipl[ôo]mes?|études|etudes|academic|formation\s+initiale)$/i },
  { key: "skills", re: /^(comp[ée]tences?|skills?|savoir[-\s]?faire|technologies|outils|hard\s+skills|compétences\s+techniques)$/i },
  { key: "languages", re: /^(langues?|languages?)$/i },
  { key: "summary", re: /^(profil|r[ée]sum[ée]|objective|objectif|about|à propos|synth[èe]se|summary)$/i },
  { key: "other", re: /^(centres?\s+d['’]int[ée]r[êe]t|intérêts|interests|certifications?|projets?|publications?|bénévolat|volontariat)$/i },
];

const MONTHS =
  /(janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?|january|february|march|april|may|june|july|august|september|october|november|december)/i;

const DATE_RANGE_RE = new RegExp(
  String.raw`(?:(?:${MONTHS.source})\s+)?(19\d{2}|20\d{2})\s*[-–—/àa]+\s*(?:(?:${MONTHS.source})\s+)?(19\d{2}|20\d{2}|aujourd'?hui|present|présent|actuel|now|en\s+cours)`,
  "i"
);

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\s.\-]{7,}\d)|(\b0[1-9](?:[\s.\-]?\d{2}){4}\b)/;
const LINKEDIN_RE = /linkedin\.com\/in\/[\w\-]+/i;

/**
 * @typedef {{
 *   text: string,
 *   page?: number,
 *   x?: number,
 *   y?: number,
 *   w?: number,
 *   h?: number,
 *   textStart?: number,
 *   textEnd?: number
 * }} CvLine
 *
 * @typedef {{
 *   title: string,
 *   company: string,
 *   startYear: number|null,
 *   endYear: number|null,
 *   ongoing: boolean,
 *   bullets: string[],
 *   raw: string,
 *   section: string
 * }} CvRole
 *
 * @typedef {{
 *   lines: CvLine[],
 *   sections: Record<string, string[]>,
 *   sectionOrder: string[],
 *   roles: CvRole[],
 *   skills: string[],
 *   contact: { email: string|null, phone: string|null, linkedin: string|null, name: string|null },
 *   layout: { columnSmell: boolean, xBimodality: number, tableHint: boolean },
 *   employmentGaps: { from: number, to: number, months: number }[]
 * }} ParsedCv
 */

/**
 * Construit des lignes depuis pagesGeo PDF (items → lignes par Y).
 * @param {import('./extract.js').PageGeo[]} pagesGeo
 * @returns {CvLine[]}
 */
export function linesFromPagesGeo(pagesGeo) {
  const lines = [];
  for (const page of pagesGeo || []) {
    const items = [...(page.items || [])].filter((it) => it.str?.trim());
    if (!items.length) continue;
    // Cluster by y (normalized)
    items.sort((a, b) => (a.rect?.y ?? 0) - (b.rect?.y ?? 0) || (a.rect?.x ?? 0) - (b.rect?.x ?? 0));
    let bucket = [];
    let bucketY = null;
    const flush = () => {
      if (!bucket.length) return;
      bucket.sort((a, b) => (a.rect?.x ?? 0) - (b.rect?.x ?? 0));
      const text = bucket
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) return;
      const xs = bucket.map((i) => i.rect?.x ?? 0);
      const ys = bucket.map((i) => i.rect?.y ?? 0);
      const x2s = bucket.map((i) => (i.rect?.x ?? 0) + (i.rect?.w ?? 0));
      const y2s = bucket.map((i) => (i.rect?.y ?? 0) + (i.rect?.h ?? 0));
      lines.push({
        text,
        page: page.page,
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...x2s) - Math.min(...xs),
        h: Math.max(...y2s) - Math.min(...ys),
        textStart: bucket[0].textStart,
        textEnd: bucket[bucket.length - 1].textEnd,
      });
      bucket = [];
      bucketY = null;
    };
    for (const it of items) {
      const y = it.rect?.y ?? 0;
      if (bucketY == null || Math.abs(y - bucketY) < 0.012) {
        bucket.push(it);
        if (bucketY == null) bucketY = y;
      } else {
        flush();
        bucket = [it];
        bucketY = y;
      }
    }
    flush();
  }
  return lines;
}

/**
 * Lignes depuis texte brut (DOCX / TXT).
 * @param {string} text
 * @returns {CvLine[]}
 */
export function linesFromText(text) {
  let cursor = 0;
  const out = [];
  const raw = text || "";
  const parts = raw.split("\n");
  for (const part of parts) {
    const start = cursor;
    const end = start + part.length;
    cursor = end + 1; // + newline
    const trimmed = part.trim();
    if (!trimmed) continue;
    out.push({
      text: trimmed,
      textStart: start + (part.match(/^\s*/)?.[0].length || 0),
      textEnd: start + part.length - (part.match(/\s*$/)?.[0].length || 0),
    });
  }
  return out;
}

function isSectionHeader(line) {
  const t = line.text.replace(/[:：]\s*$/, "").trim();
  if (t.length > 48) return null;
  // ALL CAPS or Title-like short line
  const compact = t.replace(/\s+/g, " ");
  for (const s of SECTION_HEADERS) {
    if (s.re.test(compact)) return s.key;
  }
  // Heuristic: short uppercase heading
  if (compact.length <= 32 && compact === compact.toUpperCase() && /[A-ZÀ-Ü]{3,}/.test(compact)) {
    for (const s of SECTION_HEADERS) {
      if (s.re.test(compact.toLowerCase())) return s.key;
    }
  }
  return null;
}

export function parseDateRange(line) {
  const m = String(line || "").match(DATE_RANGE_RE);
  if (!m) return null;
  const startYear = Number(m[2] || m[1]);
  const endRaw = (m[4] || m[3] || "").toLowerCase();
  const ongoing = /aujourd|present|présent|actuel|now|cours/.test(endRaw);
  const endYear = ongoing ? new Date().getFullYear() : Number(endRaw);
  if (!startYear || Number.isNaN(startYear)) return null;
  return {
    startYear,
    endYear: Number.isNaN(endYear) ? null : endYear,
    ongoing,
  };
}

function detectColumnSmell(lines) {
  const withX = lines.filter((l) => typeof l.x === "number");
  if (withX.length < 12) return { columnSmell: false, xBimodality: 0 };
  const xs = withX.map((l) => l.x);
  // Two peaks: left (<0.35) vs right (>0.45)
  const left = xs.filter((x) => x < 0.35).length;
  const right = xs.filter((x) => x > 0.45).length;
  const ratio = Math.min(left, right) / Math.max(left, right, 1);
  const xBimodality = left > 4 && right > 4 ? ratio : 0;
  // True columns: both sides populated AND many lines start mid-page
  const columnSmell = left >= 6 && right >= 6 && ratio > 0.35;
  return { columnSmell, xBimodality };
}

/**
 * Parse un CV depuis texte + géométrie optionnelle.
 * @param {string} text
 * @param {{ pagesGeo?: import('./extract.js').PageGeo[], tableCount?: number }} [opts]
 * @returns {ParsedCv}
 */
export function parseCv(text, opts = {}) {
  const lines =
    opts.pagesGeo?.length > 0 ? linesFromPagesGeo(opts.pagesGeo) : linesFromText(text);

  const sections = {
    header: [],
    summary: [],
    experience: [],
    education: [],
    skills: [],
    languages: [],
    other: [],
  };
  const sectionOrder = [];
  let current = "header";

  for (const line of lines) {
    const key = isSectionHeader(line);
    if (key) {
      current = key;
      if (!sectionOrder.includes(key)) sectionOrder.push(key);
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line.text);
  }

  // Contact from header + full text
  const head = (sections.header || []).join("\n") + "\n" + (text || "").slice(0, 600);
  const email = head.match(EMAIL_RE)?.[0] || null;
  const phone = head.match(PHONE_RE)?.[0] || null;
  const linkedin = head.match(LINKEDIN_RE)?.[0] || null;
  const name =
    (sections.header || []).find((l) => l.length > 2 && l.length < 60 && !EMAIL_RE.test(l) && !PHONE_RE.test(l)) ||
    null;

  const roles = parseRoles(sections.experience || []);
  const eduRoles = parseRoles(sections.education || [], "education");
  const skills = extractSkillsList(sections.skills || []);

  const layoutDetect = detectColumnSmell(lines);
  const employmentGaps = findEmploymentGaps(roles);

  return {
    lines,
    sections,
    sectionOrder: sectionOrder.length ? sectionOrder : Object.keys(sections).filter((k) => sections[k].length),
    roles,
    educationRoles: eduRoles,
    skills,
    contact: { email, phone, linkedin, name },
    layout: {
      columnSmell: layoutDetect.columnSmell,
      xBimodality: layoutDetect.xBimodality,
      tableHint: (opts.tableCount || 0) > 0,
      tableCount: opts.tableCount || 0,
    },
    employmentGaps,
  };
}

function parseRoles(sectionLines, section = "experience") {
  const roles = [];
  let current = null;
  const flush = () => {
    if (current) roles.push(current);
    current = null;
  };

  for (const line of sectionLines) {
    const dates = parseDateRange(line);
    const isBullet = /^[-•●▪–—*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);
    if (dates && !isBullet) {
      flush();
      // Title — Company  or Company — Title
      const cleaned = line.replace(DATE_RANGE_RE, "").replace(/\s*[|•]\s*/g, " — ").trim();
      const parts = cleaned.split(/\s+[—–\-]\s+/).map((p) => p.trim()).filter(Boolean);
      let title = parts[0] || cleaned;
      let company = parts[1] || "";
      if (parts.length >= 2 && /inc|ltd|sas|sarl|sa\b|corp|company|université|university|école|school/i.test(parts[0])) {
        company = parts[0];
        title = parts[1];
      }
      current = {
        title,
        company,
        startYear: dates.startYear,
        endYear: dates.endYear,
        ongoing: dates.ongoing,
        bullets: [],
        raw: line,
        section,
      };
      continue;
    }
    if (isBullet) {
      if (!current) {
        current = {
          title: "",
          company: "",
          startYear: null,
          endYear: null,
          ongoing: false,
          bullets: [],
          raw: "",
          section,
        };
      }
      current.bullets.push(line.replace(/^[-•●▪–—*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim());
      continue;
    }
    if (current && line.length < 80 && !dates) {
      // Possible continuation title/company
      if (!current.company && /—|–|-/.test(line)) {
        const parts = line.split(/\s+[—–\-]\s+/);
        current.company = parts[1] || current.company;
        if (parts[0] && !current.title) current.title = parts[0];
      } else if (!current.title) {
        current.title = line;
      }
    }
  }
  flush();
  return roles;
}

function extractSkillsList(lines) {
  const skills = [];
  for (const line of lines) {
    const parts = line.split(/[,;|•·]/).map((s) => s.trim()).filter((s) => s.length > 1 && s.length < 48);
    if (parts.length > 1) skills.push(...parts);
    else if (line.trim()) skills.push(line.replace(/^[-•]\s+/, "").trim());
  }
  return [...new Set(skills)];
}

/**
 * Gaps uniquement entre emplois (rôles expérience), pas formation.
 * @param {CvRole[]} roles
 */
export function findEmploymentGaps(roles) {
  const dated = roles
    .filter((r) => r.startYear && r.endYear && r.section !== "education")
    .map((r) => ({
      start: r.startYear,
      end: r.ongoing ? new Date().getFullYear() : r.endYear,
    }))
    .sort((a, b) => a.start - b.start);
  if (dated.length < 2) return [];
  const gaps = [];
  let coverEnd = dated[0].end;
  for (let i = 1; i < dated.length; i++) {
    const r = dated[i];
    if (r.start > coverEnd + 1) {
      gaps.push({
        from: coverEnd,
        to: r.start,
        months: (r.start - coverEnd) * 12,
      });
    }
    coverEnd = Math.max(coverEnd, r.end);
  }
  return gaps.filter((g) => g.months >= 18);
}

/**
 * Détecte bimodalité colonnes depuis pagesGeo (export pour analyzer).
 * @param {import('./extract.js').PageGeo[]} pagesGeo
 */
export function detectColumnsFromGeo(pagesGeo) {
  const lines = linesFromPagesGeo(pagesGeo);
  return detectColumnSmell(lines);
}

export { DATE_RANGE_RE, SECTION_HEADERS };
