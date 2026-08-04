/**
 * Parse structuré CV — lignes, sections, rôles, dates, contact.
 * Algo type Open-Resume adapté FR/EN, 100 % client.
 */

const SECTION_HEADERS = [
  {
    key: "experience",
    re: /^(exp[ée]riences?(?:\s+professionnelles?)?|parcours\s+professionnel|emploi|career|work\s+experience|professional\s+experience)$/i,
  },
  {
    key: "education",
    re: /^(?:(?:mes\s+)?formations?(?:\s+et\s+(?:dipl[ôo]mes?|certifications?))?|formation\s+(?:initiale|continue)|education|éducation|dipl[ôo]mes?|études|etudes|academic(?:\s+background)?|background\s+académique|parcours\s+académique|cursus|scolarité)$/i,
  },
  {
    key: "skills",
    re: /^(comp[ée]tences?(?:\s+techniques)?|skills?|savoir[-\s]?faire|technologies|outils|hard\s+skills|expertise\s+technique)$/i,
  },
  { key: "languages", re: /^(langues?|languages?)$/i },
  {
    key: "summary",
    re: /^(profil|r[ée]sum[ée]|objective|objectif|about|à propos|synth[èe]se|summary)$/i,
  },
  {
    key: "other",
    re: /^(centres?\s+d['’]int[ée]r[êe]t|intérêts|interests|certifications?|projets?|publications?|bénévolat|volontariat)$/i,
  },
];

const MONTHS =
  /(janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?|january|february|march|april|may|june|july|august|september|october|november|december)/i;

const DATE_RANGE_RE = new RegExp(
  String.raw`(?:(?:${MONTHS.source})\s+)?(19\d{2}|20\d{2})\s*[-–—/àa]+\s*(?:(?:${MONTHS.source})\s+)?(19\d{2}|20\d{2}|aujourd'?hui|present|présent|actuel|now|en\s+cours)`,
  "i"
);

const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i;
const PHONE_RE = /(\+?\d[\d\t .,\-]{7,}\d)|(\b0[1-9](?:[.\-\t ]?\d{2}){4}\b)/;
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
 *   contact: { email: string|null, phone: string|null, linkedin: string|null, name: string|null, location?: string|null },
 *   layout: { columnSmell: boolean, xBimodality: number, tableHint: boolean, tableCount?: number, headerSparse?: boolean, readingOrderOk?: boolean },
 *   employmentGaps: { from: number, to: number, months: number }[],
 *   graphicSkills?: boolean
 * }} ParsedCv
 */

/**
 * Normalise un titre de section (letter-spacing PDF, NFKC, casse).
 * "E X P É R I E N C E" → "expérience"
 * @param {string} raw
 */
export function normalizeHeading(raw) {
  let t = String(raw || "")
    .normalize("NFKC")
    .replace(/[:：]\s*$/, "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return "";
  const tokens = t.split(" ");
  if (tokens.length >= 3) {
    const singleCount = tokens.filter((x) => Array.from(x).length === 1).length;
    if (singleCount / tokens.length >= 0.55) {
      t = tokens.join("");
    } else {
      const out = [];
      let buf = "";
      for (const tok of tokens) {
        const chars = Array.from(tok);
        if (chars.length === 1 && /[\p{L}\p{M}]/u.test(tok)) {
          buf += tok;
        } else {
          if (buf) {
            out.push(buf);
            buf = "";
          }
          out.push(tok);
        }
      }
      if (buf) out.push(buf);
      t = out.join(" ");
    }
  }
  return t.toLowerCase().trim();
}

function matchSectionKey(normalized) {
  if (!normalized) return null;
  for (const s of SECTION_HEADERS) {
    if (s.re.test(normalized)) return s.key;
  }
  return null;
}

/**
 * Jointure gap-aware d'items PDF d'une même ligne.
 * @param {{ str?: string, rect?: { x?: number, w?: number } }[]} bucket
 */
export function joinItemsGapAware(bucket) {
  if (!bucket?.length) return "";
  let out = bucket[0].str || "";
  for (let i = 1; i < bucket.length; i++) {
    const prev = bucket[i - 1];
    const cur = bucket[i];
    const curStr = cur.str || "";
    if (!curStr) continue;
    if (/\s$/.test(out) || /^\s/.test(curStr)) {
      out += curStr;
      continue;
    }
    const prevEnd = (prev.rect?.x ?? 0) + (prev.rect?.w ?? 0);
    const dx = (cur.rect?.x ?? 0) - prevEnd;
    const charW = Math.max(
      (prev.rect?.w ?? 0.01) / Math.max(Array.from(prev.str || " ").length, 1),
      0.003
    );
    // Space only when gap looks like a word break (not mid-glyph fragments)
    if (dx > charW * 0.35) out += " ";
    out += curStr;
  }
  return out.replace(/\s+/g, " ").trim();
}

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
      const text = joinItemsGapAware(bucket);
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

/**
 * Retire emoji / pictogrammes en tête (🎓 Formation → Formation).
 * Ne touche pas aux puces déjà rejetées par isSectionHeader.
 * @param {string} raw
 */
export function stripLeadingDecorators(raw) {
  return String(raw || "")
    .replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\uFE0E]+(?:\s+|(?=\p{L}))/u, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

function isSectionHeader(line) {
  const raw = String(line?.text || "").trim();
  if (!raw) return null;
  // Bullets / numbered lines are never section headers
  if (/^[-•●▪–—*□■▫◦‣]\s+/.test(raw) || /^\d+[.)]\s+/.test(raw)) return null;

  const stripped = stripLeadingDecorators(raw) || raw;
  const normalized = normalizeHeading(stripped);
  // Guard: avoid matching long body lines (after normalize)
  if (normalized.length <= 64) {
    const exact = matchSectionKey(normalized);
    if (exact) return exact;
  }

  // Prefix form: "EXPÉRIENCE — Dev…" / "Formation | Master…"
  const prefix = normalized.split(/\s*[—–\-|•·]\s*/)[0]?.trim() || "";
  if (prefix && prefix.length <= 48 && prefix !== normalized) {
    const key = matchSectionKey(prefix);
    if (key) return key;
  }

  // Starts-with known heading then space (short heading prefix on a longer line)
  if (normalized.length <= 80) {
    for (const s of SECTION_HEADERS) {
      const body = s.re.source.replace(/^\^/, "").replace(/\$$/, "");
      const startRe = new RegExp(`^(?:${body})(?:\\s|$)`, "i");
      if (startRe.test(normalized)) {
        // Only if the matched head is the whole first phrase (≤ 3 words of heading)
        const words = normalized.split(/\s+/);
        for (let n = 1; n <= Math.min(4, words.length); n++) {
          const head = words.slice(0, n).join(" ");
          if (matchSectionKey(head)) return s.key;
        }
      }
    }
  }
  return null;
}

/** Contenu éventuel après un titre « SECTION — reste ». */
function headingRest(raw) {
  const t = stripLeadingDecorators(String(raw || ""))
    .replace(/[:：]\s*$/, "")
    .trim();
  const parts = t.split(/\s*[—–\-|]\s+/);
  if (parts.length < 2) return "";
  const head = normalizeHeading(parts[0]);
  if (!matchSectionKey(head)) return "";
  return parts.slice(1).join(" — ").trim();
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

const LOCATION_RE =
  /\b(?:\d{5}\s+)?(?:Paris|Lyon|Marseille|Lille|Toulouse|Bordeaux|Nantes|Nice|Strasbourg|Montpellier|Rennes|Grenoble|Remote|France|Belgium|Belgique|Suisse|Canada|London|Berlin|Madrid|Bruxelles|Geneva|Genève)(?:\s*,\s*(?:France|Belgique|Suisse|Canada|UK|USA))?\b|\b\d{5}\s+[A-ZÀ-Ü][a-zà-ü' -]{2,40}\b/i;

const ADDRESS_RE =
  /\b(?:\d{1,4}\s*)?(?:rue|avenue|av\.?|boulevard|bd\.?|chemin|impasse|allée|allee|place|cours|quai|route|street|st\.?|road|rd\.?|lane|drive)\s+[A-Za-zÀ-ü0-9'’\- ]{2,50}/i;

const JOB_TITLE_REJECT =
  /\b(chargé|chargée|chargee|consultant|consultante|manager|développeur|développeuse|developpeur|developer|ingénieur|ingenieure|ingenieur|engineer|responsable|directeur|directrice|assistant|assistante|commercial|marketing|comptable|designer|analyst|analyste|devops|product\s+owner|full\s*stack|frontend|backend|curriculum|vitae|\bcv\b)\b/i;

const GENERIC_INTERESTS =
  /^(lecture|cinéma|cinema|sport|voyages?|musique|cuisine|photographie|photo|jeux\s*vidéo|series?|netflix|running|foot|football|tennis|yoga)$/i;

/**
 * Parse un nom candidat strict (prénom + nom).
 * @param {string[]} headerLines
 * @returns {{ name: string|null, firstName: string|null, lastName: string|null, headline: string|null }}
 */
export function parsePersonName(headerLines) {
  const lines = (headerLines || []).map((l) => String(l || "").trim()).filter(Boolean);
  let name = null;
  let firstName = null;
  let lastName = null;
  let headline = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < 3 || l.length > 60) continue;
    if (EMAIL_RE.test(l) || PHONE_RE.test(l) || LINKEDIN_RE.test(l)) continue;
    if (LOCATION_RE.test(l) || ADDRESS_RE.test(l)) continue;
    if (isSectionHeader({ text: l })) continue;
    if (JOB_TITLE_REJECT.test(l) && !/^[A-ZÀ-Ü][a-zà-ü]+(\s+[A-ZÀ-Ü][a-zà-ü'-]+){1,3}$/.test(l)) {
      if (!headline && JOB_TITLE_REJECT.test(l)) headline = l;
      continue;
    }
    const tokens = l.split(/\s+/).filter(Boolean);
    const alphaTokens = tokens.filter((t) => /^[A-Za-zÀ-ü][A-Za-zÀ-ü'-]*$/.test(t));
    if (alphaTokens.length < 2 || alphaTokens.length > 4) {
      if (!headline && JOB_TITLE_REJECT.test(l)) headline = l;
      continue;
    }
    if (JOB_TITLE_REJECT.test(l)) {
      if (!headline) headline = l;
      continue;
    }
    name = alphaTokens.join(" ");
    firstName = alphaTokens[0];
    lastName = alphaTokens.slice(1).join(" ");
    // Next non-contact line can be headline
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const h = lines[j];
      if (EMAIL_RE.test(h) || PHONE_RE.test(h) || LINKEDIN_RE.test(h)) continue;
      if (LOCATION_RE.test(h) || ADDRESS_RE.test(h)) continue;
      if (isSectionHeader({ text: h })) break;
      if (h.length > 2 && h.length < 80) {
        headline = h;
        break;
      }
    }
    break;
  }

  if (!headline) {
    headline =
      lines.find(
        (l) =>
          l !== name &&
          JOB_TITLE_REJECT.test(l) &&
          !EMAIL_RE.test(l) &&
          !PHONE_RE.test(l) &&
          l.length < 80
      ) || null;
  }

  return { name, firstName, lastName, headline };
}

/**
 * @param {string} text
 * @returns {{ location: string|null, address: string|null }}
 */
export function parseLocationAddress(text) {
  const address = text?.match?.(ADDRESS_RE)?.[0]?.trim() || null;
  const location = text?.match?.(LOCATION_RE)?.[0]?.trim() || null;
  return { location, address };
}

/**
 * Qualité section centres d'intérêt / other.
 * @param {Record<string, string[]>} sections
 * @param {string[]} sectionOrder
 */
export function analyzeInterests(sections, sectionOrder) {
  const ordered = (sectionOrder || []).includes("other");
  const lines = (sections?.other || []).map((l) => String(l || "").trim()).filter(Boolean);
  if (!ordered) {
    return { status: "absent", lines: [], genericCount: 0 };
  }
  if (!lines.length) {
    return { status: "empty", lines: [], genericCount: 0 };
  }
  const items = [];
  for (const line of lines) {
    const parts = line.split(/[,;|•·]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) items.push(...parts);
    else items.push(line.replace(/^[-•]\s+/, "").trim());
  }
  const unique = [...new Set(items.filter(Boolean))];
  const genericCount = unique.filter((i) => GENERIC_INTERESTS.test(i)).length;
  let status = "ok";
  if (unique.length > 8 || (unique.length >= 3 && genericCount / Math.max(unique.length, 1) >= 0.6)) {
    status = "generic";
  }
  return { status, lines: unique, genericCount };
}

/**
 * Parse un CV depuis texte + géométrie optionnelle.
 * @param {string} text
 * @param {{ pagesGeo?: import('./extract.js').PageGeo[], tableCount?: number, tableHint?: boolean, headerSparse?: boolean, readingOrderOk?: boolean, profilePhotoHint?: boolean }} [opts]
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
      const rest = headingRest(line.text);
      if (rest) {
        if (!sections[current]) sections[current] = [];
        sections[current].push(rest);
      }
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line.text);
  }

  // Contact from header + full text
  const head = (sections.header || []).join("\n") + "\n" + (text || "").slice(0, 800);
  const email = head.match(EMAIL_RE)?.[0] || null;
  const phone = head.match(PHONE_RE)?.[0] || null;
  const linkedin = head.match(LINKEDIN_RE)?.[0] || null;
  const { name, firstName, lastName, headline } = parsePersonName(sections.header || []);
  const { location, address } = parseLocationAddress(head);
  const interests = analyzeInterests(sections, sectionOrder);

  const roles = parseRoles(sections.experience || []);
  const eduRoles = parseRoles(sections.education || [], "education");
  const skills = extractSkillsList(sections.skills || []);
  const graphicSkills = detectGraphicSkills(sections.skills || []);

  const layoutDetect = detectColumnSmell(lines);
  const employmentGaps = findEmploymentGaps(roles);
  const tableHint = !!opts.tableHint;
  const tableCount = opts.tableCount || 0;

  return {
    lines,
    sections,
    sectionOrder: sectionOrder.length ? sectionOrder : Object.keys(sections).filter((k) => sections[k].length),
    roles,
    educationRoles: eduRoles,
    skills,
    graphicSkills,
    interests,
    headline,
    contact: {
      email,
      phone,
      linkedin,
      name,
      firstName,
      lastName,
      location,
      address,
    },
    layout: {
      columnSmell: layoutDetect.columnSmell,
      xBimodality: layoutDetect.xBimodality,
      tableHint,
      tableCount,
      headerSparse: !!opts.headerSparse,
      readingOrderOk: opts.readingOrderOk !== false,
      profilePhotoHint: !!opts.profilePhotoHint,
    },
    employmentGaps,
  };
}

/**
 * Compétences représentées en barres / étoiles (illisibles ATS).
 * @param {string[]} lines
 */
export function detectGraphicSkills(lines) {
  const joined = (lines || []).join("\n");
  if (!joined.trim()) return false;
  const starBars = (joined.match(/[★☆●○◆◇▪▫]|[█▓▒░■□▢▣▤▥]{2,}/g) || []).length;
  const levelSlash = (joined.match(/\b([1-5]\s*\/\s*[1-5]|10\s*\/\s*10)\b/g) || []).length;
  const words = (joined.match(/[A-Za-zÀ-ü]{3,}/g) || []).length;
  // Graphic gauges with little plain skill vocabulary
  if (starBars >= 2) return true;
  if (levelSlash >= 2 && words < 6) return true;
  if (/niveau\s*[:：]/i.test(joined) && starBars + levelSlash >= 1 && words < 8) return true;
  return false;
}

function splitTitleCompany(cleaned) {
  const parts = cleaned
    .replace(/\s*[|•]\s*/g, " — ")
    .split(/\s+[—–\-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  let title = parts[0] || cleaned;
  let company = parts[1] || "";
  if (
    parts.length >= 2 &&
    /inc|ltd|sas|sarl|sa\b|corp|company|université|university|école|school/i.test(parts[0])
  ) {
    company = parts[0];
    title = parts[1];
  }
  return { title, company };
}

function isDateOnlyLine(line) {
  const cleaned = String(line || "")
    .replace(DATE_RANGE_RE, "")
    .replace(/[()[\]]/g, "")
    .trim();
  return cleaned.length <= 4;
}

function cleanAfterDateStrip(raw) {
  return String(raw || "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\s+[—–\-]\s*$/g, "")
    .replace(/^[—–\-]\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseRoles(sectionLines, section = "experience") {
  const roles = [];
  let current = null;
  /** Pending title/company lines waiting for a date on the next line(s). */
  let pendingMeta = [];
  const flush = () => {
    if (current) {
      current.title = cleanAfterDateStrip(current.title);
      current.company = cleanAfterDateStrip(current.company);
      roles.push(current);
    }
    current = null;
    pendingMeta = [];
  };

  const startRole = (title, company, dates, raw) => {
    flush();
    current = {
      title: cleanAfterDateStrip(title) || "",
      company: cleanAfterDateStrip(company) || "",
      startYear: dates?.startYear ?? null,
      endYear: dates?.endYear ?? null,
      ongoing: !!dates?.ongoing,
      bullets: [],
      raw: raw || "",
      section,
    };
  };

  const applyPendingToDates = (dates, raw) => {
    const joined = pendingMeta.join(" — ");
    // Pending mission lines → attach as bullets to previous role, don't become the new title
    if (looksLikeDutyLine(joined) && !looksLikeRoleHeader(joined)) {
      const last = roles[roles.length - 1];
      if (last) {
        for (const p of pendingMeta) {
          if (p?.trim()) last.bullets.push(p.trim());
        }
      }
      pendingMeta = [];
      let cleaned = String(raw || "").replace(DATE_RANGE_RE, "").replace(/\s+/g, " ").trim();
      cleaned = cleanAfterDateStrip(cleaned);
      const { title, company } = splitTitleCompany(cleaned);
      startRole(title, company, dates, raw);
      return;
    }
    const { title, company } = splitTitleCompany(cleanAfterDateStrip(joined || raw || ""));
    startRole(title, company, dates, [joined, raw].filter(Boolean).join(" | "));
    pendingMeta = [];
  };

  const absorbAsBullet = (line) => {
    if (!current) return false;
    current.bullets.push(String(line).replace(/^[-•●▪–—*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim());
    return true;
  };

  for (const line of sectionLines) {
    const dates = parseDateRange(line);
    const isBullet = /^[-•●▪–—*]\s+/.test(line) || /^\d+[.)]\s+/.test(line);

    if (dates && !isBullet) {
      let cleaned = line.replace(DATE_RANGE_RE, "").replace(/\s+/g, " ").trim();
      cleaned = cleanAfterDateStrip(cleaned);
      if (cleaned.length > 2 && !isDateOnlyLine(line)) {
        // Title/company + dates on the same line
        if (pendingMeta.length) {
          // Attach stray pending duties to previous role before opening the new dated one
          const pendingJoin = pendingMeta.join(" — ");
          if (looksLikeDutyLine(pendingJoin) || !looksLikeRoleHeader(pendingJoin)) {
            const last = roles[roles.length - 1] || current;
            if (last && last !== current) {
              for (const p of pendingMeta) {
                if (p?.trim()) last.bullets.push(p.trim());
              }
              pendingMeta = [];
            } else if (current) {
              for (const p of pendingMeta) {
                if (p?.trim()) current.bullets.push(p.trim());
              }
              pendingMeta = [];
            }
          }
        }
        const { title, company } = splitTitleCompany(cleaned);
        startRole(title, company, dates, line);
      } else if (pendingMeta.length) {
        // Date on the line following title/company (common FR layout)
        applyPendingToDates(dates, line);
      } else if (current && !current.startYear) {
        current.startYear = dates.startYear;
        current.endYear = dates.endYear;
        current.ongoing = dates.ongoing;
        current.raw = `${current.raw} ${line}`.trim();
      } else {
        startRole("", "", dates, line);
      }
      continue;
    }

    if (isBullet) {
      if (pendingMeta.length && !current) {
        const joined = pendingMeta.join(" — ");
        if (looksLikeDutyLine(joined) && roles.length) {
          for (const p of pendingMeta) {
            if (p?.trim()) roles[roles.length - 1].bullets.push(p.trim());
          }
          pendingMeta = [];
        } else {
          const { title, company } = splitTitleCompany(joined);
          startRole(title, company, null, pendingMeta.join(" | "));
          pendingMeta = [];
        }
      }
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
      current.bullets.push(
        line.replace(/^[-•●▪–—*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim()
      );
      continue;
    }

    // Non-bullet, no dates on this line
    if (line.length < 100) {
      if (current && current.startYear && !current.company && pendingMeta.length === 0) {
        // Company on the line after a dated title
        if (/—|–|-/.test(line) || line.length < 60) {
          const { title, company } = splitTitleCompany(line);
          if (!current.title && title) current.title = title;
          if (company) current.company = company;
          else if (!current.company) current.company = line;
          continue;
        }
      }
      if (current && !current.startYear && !current.company && current.title) {
        // Adjacent company line before dates arrive
        current.company = line;
        continue;
      }

      // Soft bullets: prose under a dated role (no marker) — no hard cap at 6
      if (
        current &&
        current.startYear &&
        current.title &&
        line.length >= 12 &&
        line.length < 180 &&
        !isSectionHeader({ text: line })
      ) {
        if (looksLikeDutyLine(line) || !looksLikeRoleHeader(line)) {
          absorbAsBullet(line);
          continue;
        }
      }

      // Strong signal only to open a new undated role header
      if (!current || (current.startYear && (current.bullets.length > 0 || current.company))) {
        if (current?.startYear && (current.bullets.length > 0 || current.company)) {
          if (looksLikeDutyLine(line) || !looksLikeRoleHeader(line)) {
            absorbAsBullet(line);
            continue;
          }
          // Credible new role header → buffer until dates
          pendingMeta = [line];
          flush();
          pendingMeta = [line];
          current = null;
        } else if (!current) {
          if (looksLikeDutyLine(line) && roles.length) {
            roles[roles.length - 1].bullets.push(line.trim());
          } else {
            pendingMeta.push(line);
            if (pendingMeta.length > 3) pendingMeta = pendingMeta.slice(-2);
          }
        } else {
          pendingMeta.push(line);
          if (pendingMeta.length > 3) pendingMeta = pendingMeta.slice(-2);
        }
      } else if (current && !current.title) {
        if (looksLikeDutyLine(line)) {
          absorbAsBullet(line);
        } else {
          current.title = line;
        }
      } else if (current && !current.company) {
        if (looksLikeDutyLine(line)) {
          absorbAsBullet(line);
        } else {
          current.company = line;
        }
      } else {
        if (current?.startYear && (looksLikeDutyLine(line) || !looksLikeRoleHeader(line))) {
          absorbAsBullet(line);
        } else {
          pendingMeta.push(line);
          if (pendingMeta.length > 3) pendingMeta = pendingMeta.slice(-2);
        }
      }
    }
  }

  if (pendingMeta.length && !current) {
    const joined = pendingMeta.join(" — ");
    if (looksLikeDutyLine(joined) || !looksLikeRoleHeader(joined)) {
      // Attach leftover mission lines to last dated role — never invent a phantom poste
      const last = roles[roles.length - 1];
      if (last) {
        for (const p of pendingMeta) {
          if (p?.trim()) last.bullets.push(p.trim());
        }
      }
      pendingMeta = [];
    } else {
      const { title, company } = splitTitleCompany(joined);
      startRole(title, company, null, pendingMeta.join(" | "));
    }
  }
  flush();
  return roles;
}

/**
 * Mission / duty / tools line — not a job header.
 * @param {string} line
 */
function looksLikeDutyLine(line) {
  const s = String(line || "").trim();
  if (!s || s.length < 8) return false;
  // Explicit tool / reporting lists
  if (/[;|]/.test(s) && s.length >= 20) return true;
  if (/\b(ATS|SIRH|Excel|PowerPoint|Word|CRM|ERP|KPI|reporting|reportings?|pipeline|sourcing|onboarding)\b/i.test(s) && s.length >= 18) {
    if (!/—|–/.test(s) || s.split(/—|–/).length > 2) return true;
  }
  // Long prose without title—company separator
  if (s.length >= 45 && !/—|–/.test(s) && /[a-záàâäéèêëíìîïóòôöúùûüç]{4,}/i.test(s)) {
    if (!/^[A-ZÀ-Ü][^a-z]{0,3}[A-Za-zÀ-ü/ ]{2,40}\s+[—–-]\s+/.test(s)) return true;
  }
  // Ends with period / colon-led description
  if (/[.!?]$/.test(s) && s.length >= 30) return true;
  if (/^[A-ZÀ-Ü][^:]{5,60}\s*:\s+\S/.test(s) && s.length >= 35) return true;
  return false;
}

/**
 * Credible undated role header (title — company) before we promote it to a role.
 * @param {string} line
 */
function looksLikeRoleHeader(line) {
  const s = String(line || "").trim();
  if (!s || s.length < 5 || s.length > 90) return false;
  if (looksLikeDutyLine(s)) return false;
  if (/[;|]/.test(s)) return false;
  // Title — Company
  if (/—|–/.test(s) || /\s[-—–]\s/.test(s)) {
    const parts = s.split(/\s*[—–-]\s*/);
    if (parts.length >= 2 && parts[0].length >= 3 && parts[1].length >= 2) return true;
  }
  // Short job-title-like line (known title tokens, no prose ending)
  if (JOB_TITLE_REJECT.test(s) && s.length < 70 && !/[.!?]$/.test(s) && !/;/.test(s)) {
    return true;
  }
  // Do NOT treat arbitrary capitalized prose as a role header
  return false;
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

export { DATE_RANGE_RE, SECTION_HEADERS, isSectionHeader, LOCATION_RE, ADDRESS_RE };
