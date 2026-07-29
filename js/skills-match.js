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
      variants = [canonical];
    } else if (raw && typeof raw === "object") {
      canonical = String(raw.label || raw.name || "").toLowerCase().trim();
      const aliases = Array.isArray(raw.aliases)
        ? raw.aliases.map((a) => String(a).toLowerCase().trim()).filter(Boolean)
        : [];
      variants = [canonical, ...aliases];
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
        // Word-ish boundary: avoid matching inside longer alphanumerics when pattern is short
        const start = i - p.length + 1;
        const before = start > 0 ? hay[start - 1] : " ";
        const after = i + 1 < hay.length ? hay[i + 1] : " ";
        const boundaryOk = p.length <= 2
          ? !/[a-z0-9à-ü._/-]/.test(before)
          : !/[a-z0-9à-ü]/.test(before) || p.includes(" ") || p.includes("/") || p.includes(".");
        const afterOk = p.length <= 2
          ? !/[a-z0-9à-ü._/-]/.test(after)
          : !/[a-z0-9à-ü]/.test(after) || p.includes(" ") || p.includes(".") || p.includes("/");
        if (!boundaryOk || !afterOk) continue;
        counts.set(canonical, (counts.get(canonical) || 0) + 1);
      }
    }
  }
  return counts;
}

/** Terme présent avec frontières de mot (évite faux positifs `.includes` courts). */
export function hasTermBoundary(haystack, term) {
  const t = String(term || "").toLowerCase().trim();
  if (!t || t.length < 2) return false;
  const hay = String(haystack || "").toLowerCase();
  if (t.includes(" ") || t.includes("/") || t.includes(".")) {
    return hay.includes(t);
  }
  const re = new RegExp(`(?:^|[^a-z0-9à-ü])${escapeReg(t)}(?=[^a-z0-9à-ü]|$)`, "i");
  return re.test(hay);
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
  const hits = [...found.keys()].filter((h) => String(h).length >= 3).sort();
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

/**
 * Overlap offre d'emploi ↔ CV (must = hard skills du JD, nice = pack/soft).
 * @param {string} cvText
 * @param {string} jdText
 */
export async function matchJdOverlap(cvText, jdText) {
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
  const { automaton, tierByLabel } = await loadSkillsLexicon();
  const roles = await loadRoleKeywords();
  const jdHits = ahoFind(automaton, jdText);
  const cvHits = ahoFind(automaton, cvText);
  const jdLower = jdText.toLowerCase();
  const packTerms = new Set();
  for (const terms of Object.values(roles.roles || {})) {
    for (const t of terms) {
      const k = String(t).toLowerCase();
      if (k.length >= 3 && hasTermBoundary(jdLower, k)) packTerms.add(k);
    }
  }
  const jdTerms = new Set([...jdHits.keys(), ...packTerms]);
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

  const mustTerms = [...jdTerms].filter((t) => (tierByLabel?.[t] || "hard") === "hard");
  const niceTerms = [...jdTerms].filter((t) => !mustTerms.includes(t));
  const inCv = (t) => cvHits.has(t) || hasTermBoundary(cvText, t);
  const overlap = [...jdTerms].filter(inCv);
  const mustPresent = mustTerms.filter(inCv);
  const mustMissing = mustTerms.filter((t) => !inCv(t));
  const mustCoverage = mustTerms.length ? mustPresent.length / mustTerms.length : 1;
  // Score pondéré : 70 % couverture must + 30 % overlap global
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
