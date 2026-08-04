/**
 * Matching compétences — Aho–Corasick + chargement lazy des lexiques.
 */

function basePath() {
  if (typeof globalThis.window !== "undefined") {
    return globalThis.window.ATS_BASE || globalThis.window.ATSSiteConfig?.base || "";
  }
  return "";
}

/** @type {null | { skills: string[], automaton: ReturnType<typeof buildAho> }} */
let skillsCache = null;
/** @type {null | object} */
let verbsFr = null;
/** @type {null | object} */
let verbsEn = null;
/** @type {null | object} */
let roleKeywords = null;
/** @type {null | Set<string>} */
let techWhitelist = null;

/** Hard skills trop ambigus en forme courte — indexés via alias longs uniquement. */
const AMBIGUOUS_SHORT_SKILLS = new Set([
  "rest",
  "sea",
  "lean",
  "go",
  "r",
  "ui",
  "ux",
  "word",
  "ats",
  "tableau",
]);

const AMBIGUOUS_CONTEXT = {
  rest: /\b(api|restful|http|endpoint|json|webservice|web\s*service)\b/i,
  sea: /\b(ads?|sem|marketing|google|campagnes?|advertising|paid\s*search)\b/i,
  lean: /\b(six\s*sigma|management|manufacturing|startup|agile|kanban)\b/i,
  go: /\b(golang|gopher|backend|module|goroutine|gin\b)\b/i,
  r: /\b(rstudio|tidyverse|cran|ggplot|dplyr|statistics|statistique)\b/i,
  ui: /\b(design|figma|interface|ux|css|front[- ]?end)\b/i,
  ux: /\b(design|research|figma|ui|user\s*experience|usabilit)\b/i,
  word: /\b(microsoft|ms\s*office|docx?|rédaction|office)\b/i,
  ats: /\b(applicant|tracking|recrutement|sirh|talent|cv\s*parsing)\b/i,
  tableau: /\b(software|desktop|server|bi\b|dashboard|viz|salesforce)\b/i,
};

/**
 * True if hay[start..end) is bounded by non-letter/digit on both sides (Unicode-aware).
 * Used for single tokens and multi-word / dotted / slashed spans alike.
 * @param {string} hay
 * @param {number} start
 * @param {number} end exclusive
 */
export function termBoundaryOk(hay, start, end) {
  if (start < 0 || end > (hay || "").length || start >= end) return false;
  const before = start > 0 ? hay[start - 1] : " ";
  const after = end < hay.length ? hay[end] : " ";
  const isWord = (ch) => /[\p{L}\p{N}_]/u.test(ch);
  return !isWord(before) && !isWord(after);
}

function isAmbiguousShortLabel(label) {
  const t = String(label || "").toLowerCase().trim();
  if (!t) return false;
  if (AMBIGUOUS_SHORT_SKILLS.has(t)) return true;
  return t.length <= 3 && !/[/. ]/.test(t);
}

function hasAmbiguousContext(haystack, term) {
  const t = String(term || "").toLowerCase().trim();
  const re = AMBIGUOUS_CONTEXT[t];
  if (!re) return false;
  return re.test(String(haystack || ""));
}

/** Variants indexed in the automaton for one lexicon entry (drop bare ambiguous shorts). */
function indexableVariants(entry) {
  const label = String(entry.label || "").toLowerCase().trim();
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((a) => String(a).toLowerCase().trim()).filter(Boolean)
    : [];
  const all = [label, ...aliases].filter(Boolean);
  if (!isAmbiguousShortLabel(label)) return [...new Set(all)];
  // Never index the bare ambiguous label — only longer / multi-token aliases
  return [
    ...new Set(
      all.filter(
        (v) =>
          v !== label &&
          (v.length >= 5 || v.includes(" ") || v.includes("/") || v.includes(".") || v.includes("-"))
      )
    ),
  ];
}

/**
 * Aho–Corasick minimal (lowercase patterns).
 * Accepts string labels or `{ label, tier, aliases }` lexicon entries.
 * Outputs store `{ pattern, canonical }` so aliases fold to the canonical label.
 * @param {(string|{label?: string, name?: string, aliases?: string[]})[]} patterns
 */
export function buildAho(patterns) {
  const root = { next: Object.create(null), fail: null, out: [] };
  for (const raw of patterns) {
    let canonical = "";
    /** @type {string[]} */
    let variants = [];
    if (typeof raw === "string") {
      canonical = raw.toLowerCase().trim();
      variants = indexableVariants({ label: canonical, aliases: [] });
    } else if (raw && typeof raw === "object") {
      canonical = String(raw.label || raw.name || "").toLowerCase().trim();
      variants = indexableVariants({
        label: canonical,
        aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
      });
    }
    if (!canonical || canonical.length < 2) continue;
    for (const p of variants) {
      if (!p || p.length < 2) continue;
      let node = root;
      for (const ch of p) {
        if (!node.next[ch]) node.next[ch] = { next: Object.create(null), fail: null, out: [] };
        node = node.next[ch];
      }
      node.out.push({ pattern: p, canonical });
    }
  }
  // Fail links BFS
  const q = [];
  for (const ch of Object.keys(root.next)) {
    root.next[ch].fail = root;
    q.push(root.next[ch]);
  }
  while (q.length) {
    const node = q.shift();
    for (const ch of Object.keys(node.next)) {
      const child = node.next[ch];
      let f = node.fail;
      while (f && !f.next[ch]) f = f.fail;
      child.fail = f && f.next[ch] ? f.next[ch] : root;
      child.out = child.out.concat(child.fail.out || []);
      q.push(child);
    }
  }
  return root;
}

/**
 * @param {ReturnType<typeof buildAho>} root
 * @param {string} text
 * @returns {Map<string, number>} canonical label → count
 */
export function ahoFind(root, text) {
  const counts = new Map();
  if (!root || !text) return counts;
  const hay = text.toLowerCase();
  let node = root;
  for (let i = 0; i < hay.length; i++) {
    const ch = hay[i];
    while (node && !node.next[ch] && node !== root) node = node.fail;
    node = (node && node.next[ch]) || root;
    if (node.out?.length) {
      for (const entry of node.out) {
        const p = typeof entry === "string" ? entry : entry.pattern;
        const canonical = typeof entry === "string" ? entry : entry.canonical;
        if (!p || p.length < 2) continue;
        const start = i - p.length + 1;
        if (!termBoundaryOk(hay, start, i + 1)) continue;
        counts.set(canonical, (counts.get(canonical) || 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * First boundary-ok index of term in haystack, or -1.
 * @param {string} haystack
 * @param {string} term
 */
export function findTermBoundaryIndex(haystack, term) {
  const t = String(term || "").toLowerCase().trim();
  if (!t || t.length < 2) return -1;
  const hay = String(haystack || "").toLowerCase();
  let from = 0;
  while (from <= hay.length - t.length) {
    const idx = hay.indexOf(t, from);
    if (idx < 0) return -1;
    if (termBoundaryOk(hay, idx, idx + t.length)) return idx;
    from = idx + 1;
  }
  return -1;
}

/** Terme présent avec frontières Unicode (y compris multi-mots / ci\/cd / react.js). */
export function hasTermBoundary(haystack, term) {
  return findTermBoundaryIndex(haystack, term) >= 0;
}

async function fetchJson(path) {
  const url = `${basePath()}${path}`;
  if (typeof fetch === "function") {
    try {
      const r = await fetch(url);
      if (r.ok) return r.json();
    } catch {
      /* fall through for Node file load */
    }
  }
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readFile } = await import("node:fs/promises");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(join(here, "..", path), "utf8");
    return JSON.parse(raw);
  }
  throw new Error(`Lexicon missing: ${path}`);
}

export async function loadSkillsLexicon() {
  if (skillsCache) return skillsCache;
  const data = await fetchJson("data/analysis/skills-fr-en.min.json");
  const entries = (data.skills || [])
    .map((s) => {
      if (typeof s === "string") {
        return { label: String(s).toLowerCase(), tier: "hard", aliases: [] };
      }
      return {
        label: String(s.label || s.name || "").toLowerCase(),
        tier: s.tier === "soft" ? "soft" : "hard",
        aliases: Array.isArray(s.aliases)
          ? s.aliases.map((a) => String(a).toLowerCase().trim()).filter(Boolean)
          : [],
      };
    })
    .filter((e) => e.label.length >= 2);
  const skills = entries.map((e) => e.label);
  const tierByLabel = Object.fromEntries(entries.map((e) => [e.label, e.tier]));
  skillsCache = {
    skills,
    entries,
    tierByLabel,
    hardSkills: entries.filter((e) => e.tier === "hard").map((e) => e.label),
    softSkills: entries.filter((e) => e.tier === "soft").map((e) => e.label),
    automaton: buildAho(entries),
    hardAutomaton: buildAho(entries.filter((e) => e.tier === "hard")),
  };
  return skillsCache;
}

export async function loadVerbs(lang = "fr") {
  if (lang === "en") {
    if (!verbsEn) verbsEn = await fetchJson("data/analysis/action-verbs.en.json");
    return verbsEn;
  }
  if (!verbsFr) verbsFr = await fetchJson("data/analysis/action-verbs.fr.json");
  return verbsFr;
}

export async function loadRoleKeywords() {
  if (!roleKeywords) roleKeywords = await fetchJson("data/analysis/keywords-by-role.json");
  return roleKeywords;
}

export async function loadTechWhitelist() {
  if (!techWhitelist) {
    const data = await fetchJson("data/analysis/tech-whitelist.json");
    techWhitelist = new Set((data.terms || []).map((t) => String(t).toLowerCase()));
  }
  return techWhitelist;
}

/** @type {null | { rules: object[], version?: number }} */
let layoutRules = null;

export async function loadAtsLayoutRules() {
  if (!layoutRules) {
    layoutRules = await fetchJson("data/analysis/ats-layout-rules.json");
  }
  return layoutRules;
}

/**
 * @param {string} text
 * @returns {Promise<{ hits: string[], hardHits: string[], softHits: string[], count: number, density: number, catalogSize: number }>}
 */
export async function matchSkills(text) {
  const { automaton, skills, tierByLabel } = await loadSkillsLexicon();
  const found = ahoFind(automaton, text || "");
  // Keep short canonicals (go, r, ui…) when matched via long aliases; drop 1-char noise only
  const hits = [...found.keys()].filter((h) => String(h).length >= 2).sort();
  const hardHits = hits.filter((h) => (tierByLabel?.[h] || "hard") === "hard");
  const softHits = hits.filter((h) => tierByLabel?.[h] === "soft");
  const words = (text || "").split(/\s+/).filter(Boolean).length || 1;
  return {
    hits,
    hardHits,
    softHits,
    count: hardHits.length,
    density: hardHits.length / Math.max(1, words / 100),
    catalogSize: skills.length,
  };
}

/**
 * Infère un pack de rôle et liste les termes hard manquants.
 * Exige une marge vs le 2ᵉ pack (ou accord headline) avant de pénaliser.
 * @param {string} text
 * @param {{ headline?: string, roleTitle?: string }} [hints]
 */
export async function matchRoleKeywordGaps(text, hints = {}) {
  const roles = await loadRoleKeywords();
  const { automaton, tierByLabel } = await loadSkillsLexicon();
  const cvHits = ahoFind(automaton, text || "");
  const head = `${hints.headline || ""} ${hints.roleTitle || ""}`.toLowerCase();
  const headBlob = `${head} ${String(text || "").slice(0, 600)}`.toLowerCase();

  const roleScores = [];
  for (const [role, terms] of Object.entries(roles.roles || {})) {
    let score = 0;
    let headHits = 0;
    for (const t of terms) {
      const k = String(t).toLowerCase();
      if (hasTermBoundary(headBlob, k) || cvHits.has(k)) score += 1;
      if (head && hasTermBoundary(head, k)) headHits += 1;
    }
    roleScores.push({ role, score, terms, headHits });
  }
  roleScores.sort((a, b) => b.score - a.score || b.headHits - a.headHits);
  const best = roleScores[0];
  const second = roleScores[1];
  if (!best || best.score < 2) {
    return { role: null, missing: [], present: [], packSize: 0, confidence: 0 };
  }
  const margin = best.score - (second?.score || 0);
  const headlineAgrees = best.headHits >= 1;
  // Ambiguous profile: no clear winner → do not penalize
  if (margin < 1 && !headlineAgrees) {
    return {
      role: null,
      missing: [],
      present: [],
      packSize: 0,
      confidence: 0,
      ambiguous: true,
      candidates: roleScores.slice(0, 2).map((r) => r.role),
    };
  }

  const present = best.terms
    .map((t) => String(t).toLowerCase())
    .filter((t) => cvHits.has(t) || hasTermBoundary(text, t));
  const missing = best.terms
    .map((t) => String(t).toLowerCase())
    .filter((t) => !present.includes(t) && (tierByLabel?.[t] || "hard") !== "soft")
    .slice(0, 8);
  const confidence = Math.min(1, (best.score + (headlineAgrees ? 2 : 0) + margin) / 10);
  return {
    role: best.role,
    missing,
    present,
    packSize: best.terms.length,
    score: best.score,
    margin,
    confidence,
  };
}

const NICE_HEADER_RE =
  /(?:^|\n)\s*(?:nice\s*[- ]?\s*to\s*[- ]?\s*haves?|souhait[ée]e?s?|bonuses?|appréci[ée]e?s?|optionnel(?:le)?s?|optional|atouts?|a\s+plus)\s*:/gi;
const MUST_HEADER_RE =
  /(?:^|\n)\s*(?:must\s*[- ]?\s*haves?|requis|obligatoire(?:s)?|required|essentiel(?:le)?s?|compétences?\s+requises?|requirements?|qualifications?)\s*:/gi;

/**
 * Découpe l'offre en zones must / nice / body à partir des en-têtes de section.
 * @param {string} jdText
 * @returns {{ zones: { start: number, end: number, kind: 'must'|'nice'|'body' }[], hasSections: boolean }}
 */
export function parseJdRequirementZones(jdText) {
  const text = String(jdText || "");
  /** @type {{ index: number, kind: 'must'|'nice', headerEnd: number }}[] */
  const headers = [];
  for (const re of [
    { re: NICE_HEADER_RE, kind: /** @type {'nice'} */ ("nice") },
    { re: MUST_HEADER_RE, kind: /** @type {'must'} */ ("must") },
  ]) {
    re.re.lastIndex = 0;
    let m;
    while ((m = re.re.exec(text)) !== null) {
      headers.push({ index: m.index, kind: re.kind, headerEnd: m.index + m[0].length });
    }
  }
  headers.sort((a, b) => a.index - b.index || (a.kind === "must" ? -1 : 1));
  // Dedupe overlapping headers (keep earlier)
  const cleaned = [];
  for (const h of headers) {
    if (cleaned.length && h.index < cleaned[cleaned.length - 1].headerEnd) continue;
    cleaned.push(h);
  }
  if (!cleaned.length) {
    return {
      zones: [{ start: 0, end: text.length, kind: "body" }],
      hasSections: false,
    };
  }
  /** @type {{ start: number, end: number, kind: 'must'|'nice'|'body' }[]} */
  const zones = [];
  if (cleaned[0].index > 0) {
    zones.push({ start: 0, end: cleaned[0].index, kind: "body" });
  }
  for (let i = 0; i < cleaned.length; i++) {
    const start = cleaned[i].headerEnd;
    const end = i + 1 < cleaned.length ? cleaned[i + 1].index : text.length;
    if (start < end) zones.push({ start, end, kind: cleaned[i].kind });
  }
  return { zones, hasSections: true };
}

function zoneKindAt(zones, index) {
  for (const z of zones) {
    if (index >= z.start && index < z.end) return z.kind;
  }
  return "body";
}

/**
 * Overlap offre d'emploi ↔ CV (must = hard hors zone nice, nice = soft / zone nice / pack-only).
 * @param {string} cvText
 * @param {string} jdText
 * @param {{ headline?: string, roleTitle?: string }} [hints]
 */
export async function matchJdOverlap(cvText, jdText, hints = {}) {
  if (!jdText || jdText.trim().length < 20) {
    return {
      overlap: [],
      score: null,
      jdTerms: [],
      mustTerms: [],
      mustMissing: [],
      mustCoverage: null,
      niceTerms: [],
    };
  }
  const { automaton, tierByLabel, entries } = await loadSkillsLexicon();
  const roles = await loadRoleKeywords();
  const jdHits = ahoFind(automaton, jdText);
  const cvHits = ahoFind(automaton, cvText);
  const jdLower = jdText.toLowerCase();
  const { zones, hasSections } = parseJdRequirementZones(jdText);
  const entryByLabel = Object.fromEntries((entries || []).map((e) => [e.label, e]));

  const findSkillIdx = (label) => {
    let idx = findTermBoundaryIndex(jdText, label);
    if (idx >= 0) return idx;
    for (const a of entryByLabel[label]?.aliases || []) {
      idx = findTermBoundaryIndex(jdText, a);
      if (idx >= 0) return idx;
    }
    return -1;
  };

  // Packs ciblés : ≥ 2 termes déjà dans l'offre, ou pack inféré CV
  const PACK_CAP = 8;
  const packOnly = new Set();
  const packScores = [];
  for (const [role, terms] of Object.entries(roles.roles || {})) {
    let hit = 0;
    for (const t of terms) {
      const k = String(t).toLowerCase();
      if (k.length < 3) continue;
      if (jdHits.has(k) || hasTermBoundary(jdLower, k)) hit += 1;
    }
    packScores.push({ role, terms, hit });
  }
  packScores.sort((a, b) => b.hit - a.hit);
  let selected = packScores.filter((p) => p.hit >= 2).slice(0, 2);
  if (!selected.length) {
    const inferred = await matchRoleKeywordGaps(cvText, hints);
    if (inferred?.role) {
      const pack = packScores.find((p) => p.role === inferred.role);
      if (pack && pack.hit >= 1) selected = [pack];
    }
  }
  let added = 0;
  for (const pack of selected) {
    for (const t of pack.terms) {
      if (added >= PACK_CAP) break;
      const k = String(t).toLowerCase();
      if (k.length < 3) continue;
      if (jdHits.has(k)) continue;
      if (!hasTermBoundary(jdLower, k)) continue;
      if (isAmbiguousShortLabel(k) && !hasAmbiguousContext(jdLower, k)) continue;
      packOnly.add(k);
      added += 1;
    }
  }

  const jdTerms = new Set([...jdHits.keys(), ...packOnly]);
  if (!jdTerms.size) {
    return {
      overlap: [],
      score: 0,
      jdTerms: [],
      mustTerms: [],
      mustMissing: [],
      mustCoverage: 0,
      niceTerms: [],
    };
  }

  const mustTerms = [];
  const niceTerms = [];
  for (const t of jdTerms) {
    const tier = tierByLabel?.[t] || "hard";
    const fromPackOnly = packOnly.has(t) && !jdHits.has(t);
    if (tier === "soft" || fromPackOnly) {
      niceTerms.push(t);
      continue;
    }
    // Hard from Aho: classify by JD zone when sections exist
    const idx = findSkillIdx(t);
    const zone = idx >= 0 ? zoneKindAt(zones, idx) : "body";
    if (hasSections && zone === "nice") {
      niceTerms.push(t);
    } else {
      // No sections → all hard = must (comportement historique)
      // With sections → must zone + body = must
      mustTerms.push(t);
    }
  }

  const inCv = (t) => cvHits.has(t) || hasTermBoundary(cvText, t);
  const overlap = [...jdTerms].filter(inCv);
  const mustPresent = mustTerms.filter(inCv);
  const mustMissing = mustTerms.filter((t) => !inCv(t));
  const mustCoverage = mustTerms.length ? mustPresent.length / mustTerms.length : 1;
  const globalRatio = overlap.length / jdTerms.size;
  const score = Math.round((mustCoverage * 0.7 + globalRatio * 0.3) * 100);

  return {
    overlap: overlap.sort(),
    score,
    jdTerms: [...jdTerms].sort(),
    mustTerms: mustTerms.sort(),
    mustMissing: mustMissing.sort(),
    mustCoverage: Math.round(mustCoverage * 100),
    niceTerms: niceTerms.sort(),
  };
}

/**
 * Compte verbes strong/weak — scoper sur un extrait (expérience) si fourni,
 * tout en localisant les indices dans le texte complet.
 * @param {string} text
 * @param {'fr'|'en'} lang
 * @param {{ scope?: string }} [opts]
 */
export async function countVerbs(text, lang = "fr", opts = {}) {
  const verbs = await loadVerbs(lang);
  const full = text || "";
  const searchIn = opts.scope && String(opts.scope).trim().length >= 40 ? opts.scope : full;
  const lower = searchIn.toLowerCase();
  let strong = 0;
  let weak = 0;
  const weakHits = [];
  for (const v of verbs.strong || []) {
    const re = new RegExp(`\\b${escapeReg(v)}\\b`, "gi");
    const m = lower.match(re);
    if (m) strong += m.length;
  }
  for (const v of verbs.weak || []) {
    const copy = new RegExp(`\\b${escapeReg(v)}\\b`, "gi");
    let m;
    while ((m = copy.exec(searchIn)) !== null) {
      weak += 1;
      if (weakHits.length < 8) {
        const quote = m[0];
        // Prefer index in full CV text for geometry
        const fullIdx = full.toLowerCase().indexOf(String(searchIn).toLowerCase().slice(Math.max(0, m.index - 8), m.index + quote.length + 8));
        let index = m.index;
        if (fullIdx >= 0) {
          const local = full.toLowerCase().indexOf(quote.toLowerCase(), fullIdx);
          if (local >= 0) index = local;
        } else {
          const direct = full.toLowerCase().indexOf(quote.toLowerCase());
          if (direct >= 0) index = direct;
        }
        weakHits.push({
          quote,
          index,
          suggestion: (verbs.replacements?.[v] || ["Led", "Piloté"])[0] + " …",
          weak: v,
        });
      }
    }
  }
  return { strong, weak, weakHits, replacements: verbs.replacements || {}, scoped: searchIn !== full };
}

function escapeReg(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Précharge tous les lexiques (appelé au boot analyse).
 */
export async function preloadAnalysisData() {
  await Promise.all([
    loadSkillsLexicon().catch(() => null),
    loadVerbs("fr").catch(() => null),
    loadVerbs("en").catch(() => null),
    loadRoleKeywords().catch(() => null),
    loadTechWhitelist().catch(() => null),
    loadAtsLayoutRules().catch(() => null),
  ]);
}

/** Reset caches (tests). */
export function resetSkillsMatchCaches() {
  skillsCache = null;
  verbsFr = null;
  verbsEn = null;
  roleKeywords = null;
  techWhitelist = null;
  layoutRules = null;
}
