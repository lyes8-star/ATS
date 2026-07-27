/**
 * Matching compétences — Aho–Corasick + chargement lazy des lexiques.
 */

function basePath() {
  return window.ATS_BASE || window.ATSSiteConfig?.base || "";
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
 * @param {string[]} patterns
 */
export function buildAho(patterns) {
  const root = { next: Object.create(null), fail: null, out: [] };
  for (const raw of patterns) {
    const p = String(raw || "").toLowerCase().trim();
    if (!p || p.length < 2) continue;
    let node = root;
    for (const ch of p) {
      if (!node.next[ch]) node.next[ch] = { next: Object.create(null), fail: null, out: [] };
      node = node.next[ch];
    }
    node.out.push(p);
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
 * @returns {Map<string, number>}
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
      for (const p of node.out) {
        // Word-ish boundary: avoid matching inside longer alphanumerics when pattern is short
        const start = i - p.length + 1;
        const before = start > 0 ? hay[start - 1] : " ";
        const after = i + 1 < hay.length ? hay[i + 1] : " ";
        const boundaryOk =
          !/[a-z0-9à-ü]/.test(before) || p.includes(" ") || p.includes("/") || p.includes(".");
        const afterOk = !/[a-z0-9à-ü]/.test(after) || p.includes(" ");
        if (!boundaryOk || !afterOk) continue;
        counts.set(p, (counts.get(p) || 0) + 1);
      }
    }
  }
  return counts;
}

async function fetchJson(path) {
  const url = `${basePath()}${path}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Lexicon missing: ${path}`);
  return r.json();
}

export async function loadSkillsLexicon() {
  if (skillsCache) return skillsCache;
  const data = await fetchJson("data/analysis/skills-fr-en.min.json");
  const skills = (data.skills || []).map((s) => String(s).toLowerCase());
  skillsCache = { skills, automaton: buildAho(skills) };
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

/**
 * @param {string} text
 * @returns {Promise<{ hits: string[], count: number, density: number }>}
 */
export async function matchSkills(text) {
  const { automaton, skills } = await loadSkillsLexicon();
  const found = ahoFind(automaton, text || "");
  const hits = [...found.keys()].sort();
  const words = (text || "").split(/\s+/).filter(Boolean).length || 1;
  return {
    hits,
    count: hits.length,
    density: hits.length / Math.max(1, words / 100),
    catalogSize: skills.length,
  };
}

/**
 * Overlap offre d'emploi ↔ CV.
 * @param {string} cvText
 * @param {string} jdText
 */
export async function matchJdOverlap(cvText, jdText) {
  if (!jdText || jdText.trim().length < 20) {
    return { overlap: [], score: null, jdTerms: [] };
  }
  const { automaton } = await loadSkillsLexicon();
  const roles = await loadRoleKeywords();
  const jdHits = ahoFind(automaton, jdText);
  const cvHits = ahoFind(automaton, cvText);
  // Also harvest role pack terms present in JD
  const jdLower = jdText.toLowerCase();
  const packTerms = new Set();
  for (const terms of Object.values(roles.roles || {})) {
    for (const t of terms) {
      if (jdLower.includes(String(t).toLowerCase())) packTerms.add(String(t).toLowerCase());
    }
  }
  const jdTerms = new Set([...jdHits.keys(), ...packTerms]);
  if (!jdTerms.size) return { overlap: [], score: 0, jdTerms: [] };
  const overlap = [...jdTerms].filter((t) => cvHits.has(t) || (cvText || "").toLowerCase().includes(t));
  const score = Math.round((overlap.length / jdTerms.size) * 100);
  return { overlap: overlap.sort(), score, jdTerms: [...jdTerms].sort() };
}

/**
 * Compte verbes strong/weak dans le texte.
 * @param {string} text
 * @param {'fr'|'en'} lang
 */
export async function countVerbs(text, lang = "fr") {
  const verbs = await loadVerbs(lang);
  const lower = (text || "").toLowerCase();
  let strong = 0;
  let weak = 0;
  const weakHits = [];
  for (const v of verbs.strong || []) {
    const re = new RegExp(`\\b${escapeReg(v)}\\b`, "gi");
    const m = lower.match(re);
    if (m) strong += m.length;
  }
  for (const v of verbs.weak || []) {
    const re = new RegExp(`\\b${escapeReg(v)}\\b`, "gi");
    let m;
    const copy = new RegExp(re.source, "gi");
    while ((m = copy.exec(text || "")) !== null) {
      weak += 1;
      if (weakHits.length < 8) {
        weakHits.push({
          quote: m[0],
          index: m.index,
          suggestion: (verbs.replacements?.[v] || ["Led", "Piloté"])[0] + " …",
          weak: v,
        });
      }
    }
  }
  return { strong, weak, weakHits, replacements: verbs.replacements || {} };
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
  ]);
}
