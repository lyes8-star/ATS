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
 * Accepts string labels or `{ label, tier }` lexicon entries.
 * @param {(string|{label?: string, name?: string})[]} patterns
 */
export function buildAho(patterns) {
  const root = { next: Object.create(null), fail: null, out: [] };
  for (const raw of patterns) {
    const label =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object"
          ? raw.label || raw.name || ""
          : "";
    const p = String(label || "").toLowerCase().trim();
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
  const entries = (data.skills || []).map((s) => {
    if (typeof s === "string") return { label: String(s).toLowerCase(), tier: "hard" };
    return {
      label: String(s.label || s.name || "").toLowerCase(),
      tier: s.tier === "soft" ? "soft" : "hard",
    };
  }).filter((e) => e.label.length >= 2);
  const skills = entries.map((e) => e.label);
  const tierByLabel = Object.fromEntries(entries.map((e) => [e.label, e.tier]));
  skillsCache = {
    skills,
    tierByLabel,
    hardSkills: entries.filter((e) => e.tier === "hard").map((e) => e.label),
    softSkills: entries.filter((e) => e.tier === "soft").map((e) => e.label),
    automaton: buildAho(skills),
    hardAutomaton: buildAho(entries.filter((e) => e.tier === "hard").map((e) => e.label)),
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
 * @param {string} text
 * @param {{ headline?: string, roleTitle?: string }} [hints]
 */
export async function matchRoleKeywordGaps(text, hints = {}) {
  const roles = await loadRoleKeywords();
  const { automaton, tierByLabel } = await loadSkillsLexicon();
  const cvHits = ahoFind(automaton, text || "");
  const head = `${hints.headline || ""} ${hints.roleTitle || ""} ${text.slice(0, 600)}`.toLowerCase();

  const roleScores = [];
  for (const [role, terms] of Object.entries(roles.roles || {})) {
    let score = 0;
    for (const t of terms) {
      const k = String(t).toLowerCase();
      if (head.includes(k) || cvHits.has(k)) score += 1;
    }
    roleScores.push({ role, score, terms });
  }
  roleScores.sort((a, b) => b.score - a.score);
  const best = roleScores[0];
  if (!best || best.score < 2) {
    return { role: null, missing: [], present: [], packSize: 0 };
  }
  const present = best.terms
    .map((t) => String(t).toLowerCase())
    .filter((t) => cvHits.has(t) || (text || "").toLowerCase().includes(t));
  const missing = best.terms
    .map((t) => String(t).toLowerCase())
    .filter((t) => !present.includes(t) && (tierByLabel?.[t] || "hard") !== "soft")
    .slice(0, 8);
  return {
    role: best.role,
    missing,
    present,
    packSize: best.terms.length,
    score: best.score,
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
    loadAtsLayoutRules().catch(() => null),
  ]);
}
