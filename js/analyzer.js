/**
 * Moteur d'analyse ATS — évaluations côté client
 */

import { parseCv } from "./parse-cv.js";

const ACTION_VERBS = [
  "dirigé", "dirigée", "piloté", "pilotée", "géré", "gérée", "coordonné", "coordonnée",
  "développé", "développée", "conçu", "conçue", "créé", "créée", "lancé", "lancée", "mis en place",
  "amélioré", "améliorée", "optimisé", "optimisée", "augmenté", "augmentée", "réduit", "réduite",
  "négocié", "négociée", "supervisé", "supervisée", "formé", "formée", "recruté", "recrutée",
  "analysé", "analysée", "implémenté", "implémentée", "déployé", "déployée", "automatisé",
  "assuré", "assurée", "réalisé", "réalisée", "conduit", "conduite", "élaboré", "élaborée",
  "structuré", "structurée", "renforcé", "renforcée", "accompagné", "accompagnée",
  "transformé", "transformée", "modernisé", "modernisée", "configuré", "configurée",
  "consolidé", "consolidée", "initié", "initiée", "sécurisé", "sécurisée", "accéléré", "accélérée",
  "résolu", "résolue", "établi", "établie", "généré", "générée", "contribué",
  "led", "managed", "developed", "designed", "created", "launched", "improved", "optimized",
  "increased", "reduced", "negotiated", "supervised", "trained", "recruited", "analyzed",
  "implemented", "deployed", "automated", "built", "delivered", "achieved", "drove",
  "spearheaded", "streamlined", "mentored", "facilitated", "orchestrated", "engineered",
  "executed", "initiated", "established", "resolved", "secured", "accelerated", "generated",
  "contributed", "coordinated", "integrated", "configured", "modernized", "transformed",
];

const SECTION_PATTERNS = {
  experience: /\b(exp[ée]rience|exp[ée]riences?\s+professionnelles?|parcours|emploi|career|work\s+experience|professional\s+experience)\b/i,
  education: /\b(formation|formations?|education|éducation|dipl[ôo]mes?|études|etudes|academic)\b/i,
  skills: /\b(comp[ée]tences?|skills?|savoir[-\s]?faire|technologies|outils|hard\s+skills)\b/i,
  languages: /\b(langues?|languages?)\b/i,
  summary: /\b(profil|r[ée]sum[ée]|objective|objectif|about|à propos|synth[èe]se)\b/i,
  certifications: /\b(certifications?|habilitations?|accréditations?|licences?)\b/i,
  projects: /\b(projets?|projects?|réalisations?)\b/i,
  publications: /\b(publications?|articles?|communications?)\b/i,
  volunteering: /\b(bénévolat|volontariat|volunteering|associatif|engagement)\b/i,
  references: /\b(références?|references?|recommandations?)\b/i,
};

const JOB_TITLE_HINTS =
  /\b(d[ée]veloppeur|developer|ing[ée]nieur|engineer|manager|chef de projet|consultant|analyst|analyste|responsable|directeur|directrice|assistant|assistante|commercial|marketing|comptable|rh|ressources humaines|designer|product owner|devops|data scientist|architecte|juriste|avocat|infirmier|enseignant|product manager|scrum master|business analyst|chef de produit|technicien|technicienne|coordinateur|coordinatrice|charg[ée]e?\s+de\s+mission|data analyst|ux designer|project manager)\b/i;

const PROFESSIONAL_KEYWORDS = [
  "gestion", "projet", "équipe", "client", "stratégie", "budget", "performance",
  "processus", "qualité", "reporting", "kpi", "agile", "scrum", "management",
  "communication", "négociation", "analyse", "données", "digital", "innovation",
  "leadership", "collaboration", "planning", "stakeholder", "roadmap", "crm",
  "erp", "excel", "powerpoint", "sql", "python", "javascript", "java", "sap",
  "compliance", "audit", "formation", "recrutement", "vente", "commercial",
  "marketing", "finance", "comptable", "logistique", "supply chain", "ops",
  "product", "ux", "ui", "devops", "cloud", "aws", "azure", "api", "saas",
  "docker", "kubernetes", "git", "react", "angular", "node", "typescript",
  "terraform", "ci/cd", "machine learning", "power bi", "tableau", "jira",
  "figma", "salesforce", "mongodb", "postgresql", "redis", "graphql", "rest",
];

/** Soft skills — never count as hard keyword density (fallback path). */
const SOFT_KEYWORD_BLOCKLIST = new Set(
  [
    "communication",
    "leadership",
    "collaboration",
    "négociation",
    "negociation",
    "innovation",
    "digital",
    "management",
    "équipe",
    "equipe",
    "client",
    "qualité",
    "qualite",
    "performance",
    "stratégie",
    "strategie",
    "gestion",
    "planning",
    "stakeholder",
    "formation",
    "recrutement",
    "vente",
    "commercial",
    "marketing",
    "analyse",
    "données",
    "donnees",
    "processus",
    "projet",
    "équipe",
  ].map((s) => s.toLowerCase())
);

function isSoftKeyword(term) {
  return SOFT_KEYWORD_BLOCKLIST.has(String(term || "").toLowerCase().trim());
}

/** Hard-only fallback lexicon when skillsMatch is unavailable. */
const HARD_FALLBACK_KEYWORDS = PROFESSIONAL_KEYWORDS.filter((k) => !isSoftKeyword(k));

const ACADEMIC_MARKERS = [
  "thèse", "these", "doctorat", "phd", "publication", "publications", "article scientifique",
  "colloque", "symposium", "laboratoire", "chercheur", "chercheuse", "mémoire", "memoire",
  "post-doc", "postdoc", "citation", "revue académique", "université",
];

const COMMON_TYPOS = [
  { wrong: /\bacceuil\b/gi, right: "accueil" },
  { wrong: /\bdèveloppeur\b/gi, right: "développeur" },
  { wrong: /\bdeveloppeur\b/gi, right: "développeur" },
  { wrong: /\bprofessionel(le)?\b/gi, right: "professionnel$1" },
  { wrong: /\bprofessionelle\b/gi, right: "professionnelle" },
  { wrong: /\bresponable\b/gi, right: "responsable" },
  { wrong: /\bexpèrience\b/gi, right: "expérience" },
  { wrong: /\bexperience\b/gi, right: "expérience", skipIfEn: true },
  { wrong: /\bcompètence(s)?\b/gi, right: "compétence$1" },
  { wrong: /\bcompétance(s)?\b/gi, right: "compétence$1" },
  { wrong: /\bmanagment\b/gi, right: "management" },
  { wrong: /\borganisationel(le)?\b/gi, right: "organisationnel$1" },
  { wrong: /\bintélligent(e)?\b/gi, right: "intelligent$1" },
  { wrong: /\binformation(s)?\s+personelle(s)?\b/gi, right: "informations personnelles" },
  { wrong: /\baddresse\b/gi, right: "adresse" },
  { wrong: /\bcoordonées\b/gi, right: "coordonnées" },
  { wrong: /\bcoordonnés\b/gi, right: "coordonnées" },
  { wrong: /\bconnnaissance(s)?\b/gi, right: "connaissance$1" },
  { wrong: /\bappplication(s)?\b/gi, right: "application$1" },
  { wrong: /\breferance(s)?\b/gi, right: "référence$1" },
  { wrong: /\bréferance(s)?\b/gi, right: "référence$1" },
  { wrong: /\bavaillable\b/gi, right: "available" },
  { wrong: /\brecieved\b/gi, right: "received" },
  { wrong: /\bmanagment\b/gi, right: "management" },
  { wrong: /\bteh\b/gi, right: "the" },
  { wrong: /\bseperat(e|ely)\b/gi, right: "separat$1" },
  { wrong: /\boccurence(s)?\b/gi, right: "occurrence$1" },
  { wrong: /\bsuccesful(ly)?\b/gi, right: "successful$1" },
  { wrong: /\benviroment\b/gi, right: "environment" },
  { wrong: /\blangauge(s)?\b/gi, right: "language$1" },
  { wrong: /\bdependant\b/gi, right: "dependent", skipIfFr: true },
  { wrong: /\bappart\b/gi, right: "à part" },
  { wrong: /\bmalgré\s+que\b/gi, right: "bien que" },
  { wrong: /\bauparavent\b/gi, right: "auparavant" },
  { wrong: /\baprés\b/gi, right: "après" },
  { wrong: /\bparceque\b/gi, right: "parce que" },
  { wrong: /\bquelque\s+soit\b/gi, right: "quel que soit" },
  { wrong: /\bai\s+eu\s+l'?occasion\b/gi, right: "j'ai eu l'occasion" },
  { wrong: /\bcurriculum\s+vitea\b/gi, right: "curriculum vitae" },
  { wrong: /\bdipl[oô]me\b/gi, right: "diplôme", skipIfEn: true },
  { wrong: /\bmaitrise\b/gi, right: "maîtrise", skipIfEn: true },
  { wrong: /\bbaccalaureat\b/gi, right: "baccalauréat", skipIfEn: true },
  { wrong: /\bcompétance(s)?\b/gi, right: "compétence$1" },
  { wrong: /\breussit\b/gi, right: "réussi", skipIfEn: true },
  { wrong: /\bresposable\b/gi, right: "responsable" },
  { wrong: /\bcommerçial(e)?\b/gi, right: "commercial$1" },
  { wrong: /\badminsitratif\b/gi, right: "administratif" },
  { wrong: /\binformatque\b/gi, right: "informatique" },
  { wrong: /\bengieneer\b/gi, right: "engineer" },
  { wrong: /\bacheived\b/gi, right: "achieved" },
  { wrong: /\bcommited\b/gi, right: "committed" },
  { wrong: /\bliason\b/gi, right: "liaison" },
  { wrong: /\benviromental\b/gi, right: "environmental" },
];

const COMMON_GRAMMAR = [
  { wrong: /\bj['']ai\s+réalis[ée]r\b/gi, right: "j'ai réalisé" },
  { wrong: /\bj['']ai\s+gér[ée]r\b/gi, right: "j'ai géré" },
  { wrong: /\bj['']ai\s+développ[ée]r\b/gi, right: "j'ai développé" },
  { wrong: /\bj['']ai\s+mis\s+en\s+placee\b/gi, right: "j'ai mis en place" },
  { wrong: /\bles\s+missions?\s+qui\s+m['']a\b/gi, right: "les missions qui m'ont" },
  { wrong: /\bparceque\b/gi, right: "parce que" },
  { wrong: /\bmalgré\s+que\b/gi, right: "bien que" },
  { wrong: /\bau\s+final\b/gi, right: "au final → finalement / pour finir" },
  { wrong: /\bparmis\b/gi, right: "parmi" },
  { wrong: /\ben\s+temps\s+que\b/gi, right: "en tant que" },
  { wrong: /\bdu\s+coup\b/gi, right: "par conséquent / ainsi" },
  { wrong: /\bça\s+a\s+été\b/gi, right: "cela a été" },
  { wrong: /\bje\s+me\s+suis\s+occupé\s+de\s+de\b/gi, right: "je me suis occupé de" },
  { wrong: /\bresponsable\s+des?\s+suivis?\s+des?\s+dossiers\b/gi, right: "assuré le suivi des dossiers" },
  { wrong: /\bà\s+[A-Z]/g, right: null, skipCheck: true },
  { wrong: /\ba\s+(été|permis|contribué|favorisé|facilité)\b/gi, right: "a $1", noFire: true },
  { wrong: /\btout\s+les\b/gi, right: "tous les" },
  { wrong: /\bj['']ai\s+pu\s+développé\b/gi, right: "j'ai pu développer" },
  { wrong: /\bj['']ai\s+pu\s+géré\b/gi, right: "j'ai pu gérer" },
  { wrong: /\bj['']ai\s+pu\s+réalisé\b/gi, right: "j'ai pu réaliser" },
  { wrong: /\bles\s+erreur\b/gi, right: "les erreurs" },
  { wrong: /\bplusieurs\s+année\b/gi, right: "plusieurs années" },
];

function findGrammarIssues(text, lang) {
  if (lang === "en") return [];
  const issues = [];
  const seen = new Set();
  for (const tip of COMMON_GRAMMAR) {
    if (tip.skipCheck || tip.noFire) continue;
    if (tip.right == null) continue;
    tip.wrong.lastIndex = 0;
    let m;
    while ((m = tip.wrong.exec(text)) !== null) {
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      let ctx = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (start > 0) ctx = "…" + ctx;
      if (end < text.length) ctx = ctx + "…";
      const rightRaw = String(tip.right);
      const right = rightRaw.includes("→")
        ? rightRaw
        : m[0].replace(tip.wrong, tip.right);
      tip.wrong.lastIndex = 0;
      issues.push({
        wrong: m[0],
        right: right.includes("→") ? right.split("→").pop().trim() : right,
        context: ctx,
        textStart: m.index,
        textEnd: m.index + m[0].length,
        kind: "grammar",
      });
      if (issues.length >= 8) return issues;
    }
  }
  return issues;
}

function normalizeText(text) {
  // Offset-preserving: keep alignment with PDF pagesGeo / applyAll.
  // Only strip nulls and normalize CRLF — do NOT trim or collapse newlines.
  return (text || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n");
}

function countMatches(text, patterns) {
  let count = 0;
  for (const p of patterns) {
    if (typeof p === "string") {
      const re = new RegExp(`\\b${escapeReg(p)}\\b`, "gi");
      const m = text.match(re);
      if (m) count += m.length;
    } else if (p.test(text)) {
      count += 1;
      p.lastIndex = 0;
    }
  }
  return count;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function estimatePages(text, fileMeta = {}) {
  if (fileMeta.pages) return fileMeta.pages;
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 450));
}

function detectEmail(text) {
  return /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i.test(text);
}

function detectPhone(text) {
  return /(\+?\d[\d\t .,\-]{7,}\d)|(\b0[1-9](?:[.\-\t ]?\d{2}){4}\b)|(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})|(\+\d{2,3}[\s.\-]?\d[\d\s.\-]{7,14}\d)/.test(text);
}

function detectLinkedIn(text) {
  return /linkedin\.com\/in\/[\w\-.%]+/i.test(text || "");
}

const PHONE_LIKE_RE = /(\+?\d[\d\t .,\-]{7,}\d)|(\b0[1-9](?:[.\-\t ]?\d{2}){4}\b)|(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})|(\+\d{2,3}[\s.\-]?\d[\d\s.\-]{7,14}\d)/;

/** Métriques « résultat » uniquement (pas dates / tél / CP). */
function countResultMetrics(text) {
  if (!text) return 0;
  const patterns = [
    /\b\d+([.,]\d+)?\s*%/gi,
    /\b\d+([.,]\d+)?\s*(€|\$|k€|m€|M€)\b/gi,
    /* Resserré : k€ / k$ seulement — pas le bare « 3 k » (faux KPI) */
    /\b\d+([.,]\d+)?\s*k(?:€|\$)\b/gi,
    /\b\d{1,3}(?:[\s.,]\d{3})+\s*(?:clients?|users?|utilisateurs?|membres?|personnes?|collaborateurs?|développeurs?|équipes?|jours?|semaines?|mois|projets?|tickets?|commandes?|ventes?|leads?)?\b/gi,
    /\b\d+([.,]\d+)?\s*(?:clients?|users?|utilisateurs?|membres?|personnes?|collaborateurs?|développeurs?|équipes?|jours?|semaines?|mois|projets?|tickets?|commandes?|ventes?|leads?)\b/gi,
    /\b(?:équipe|team|budget|ca|chiffre)\s*(?:de\s+)?\d+/gi,
  ];
  const seen = new Set();
  let count = 0;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const t = m[0].trim();
      if (seen.has(t.toLowerCase())) continue;
      // Pure year or year-looking without unit/volume word
      if (/^(19|20)\d{2}$/.test(t.replace(/\s/g, ""))) continue;
      if (PHONE_LIKE_RE.test(t) && t.replace(/\D/g, "").length >= 10) continue;
      if (/^\d{5}$/.test(t.replace(/\s/g, ""))) continue;
      if (/^\d+\s*(ans?|mois|jours?)\b/i.test(t)) continue;
      if (/\b(page|phase|lot|poste|niveau|étape)\s+\d+/i.test(t)) continue;
      const teamMatch = t.match(/\b(?:équipe|team)\s*(?:de\s+)?(\d+)/i);
      if (teamMatch && Number(teamMatch[1]) <= 5) continue;
      seen.add(t.toLowerCase());
      count += 1;
    }
  }
  return count;
}

function bulletHasResultMetric(bullet) {
  return countResultMetrics(bullet) > 0;
}

function hasParsedSection(parsed, key) {
  return Array.isArray(parsed?.sections?.[key]) && parsed.sections[key].length > 0;
}

function detectDates(text) {
  const patterns = [
    /\b(20\d{2}|19\d{2})\s*[-–—/]\s*(20\d{2}|19\d{2}|aujourd'?hui|present|présent|actuel|now|en cours)\b/gi,
    /\b(janv\.?|févr\.?|mars|avr\.?|mai|juin|juil\.?|août|sept\.?|oct\.?|nov\.?|déc\.?|january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2}|19\d{2})/gi,
    /\b(20\d{2}|19\d{2})\b/g,
  ];
  const years = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const nums = m[0].match(/20\d{2}|19\d{2}/g);
      if (nums) nums.forEach((y) => years.add(Number(y)));
    }
  }
  return [...years].sort((a, b) => a - b);
}

function findEmploymentGap(years) {
  if (years.length < 2) return null;
  let maxGap = 0;
  let gapStart = null;
  for (let i = 1; i < years.length; i++) {
    const gap = years[i] - years[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = years[i - 1];
    }
  }
  if (maxGap >= 2) {
    return { months: maxGap * 12, years: maxGap, from: gapStart, to: gapStart + maxGap };
  }
  return null;
}

/** Detect overlapping role dates. */
function findOverlappingDates(roles) {
  const dated = (roles || [])
    .filter((r) => r.startYear && r.endYear && r.section !== "education")
    .map((r) => ({
      start: r.startYear,
      end: r.ongoing ? new Date().getFullYear() : r.endYear,
      title: r.title || "",
    }))
    .sort((a, b) => a.start - b.start);
  const overlaps = [];
  for (let i = 1; i < dated.length; i++) {
    if (dated[i].start < dated[i - 1].end) {
      overlaps.push({
        role1: dated[i - 1].title,
        role2: dated[i].title,
        overlapYears: dated[i - 1].end - dated[i].start,
      });
    }
  }
  return overlaps;
}

/** Check if roles are in reverse chronological order (most recent first). */
function isReverseChronological(roles) {
  const dated = (roles || [])
    .filter((r) => r.startYear && r.section !== "education")
    .map((r) => r.startYear);
  if (dated.length < 2) return true;
  for (let i = 1; i < dated.length; i++) {
    if (dated[i] > dated[i - 1]) return false;
  }
  return true;
}

function detectLanguage(text) {
  const frHits = (text.match(/\b(le|la|les|des|une|pour|avec|dans|expérience|formation|compétences)\b/gi) || []).length;
  const enHits = (text.match(/\b(the|and|with|for|experience|education|skills|of|to)\b/gi) || []).length;
  return frHits >= enHits ? "fr" : "en";
}

function findSpellingIssues(text, lang, whitelist = null) {
  const issues = [];
  const seen = new Set();
  const wl = whitelist instanceof Set ? whitelist : null;
  for (const tip of COMMON_TYPOS) {
    if (lang === "en" && tip.skipIfEn) continue;
    if (lang === "fr" && tip.skipIfFr) continue;
    tip.wrong.lastIndex = 0;
    let m;
    while ((m = tip.wrong.exec(text)) !== null) {
      const key = m[0].toLowerCase();
      if (seen.has(key)) continue;
      if (wl && wl.has(key)) continue;
      seen.add(key);
      const start = Math.max(0, m.index - 30);
      const end = Math.min(text.length, m.index + m[0].length + 30);
      let ctx = text.slice(start, end).replace(/\s+/g, " ").trim();
      if (start > 0) ctx = "…" + ctx;
      if (end < text.length) ctx = ctx + "…";
      const right = m[0].replace(tip.wrong, tip.right);
      const matchIndex = m.index;
      const matchLen = m[0].length;
      tip.wrong.lastIndex = 0;
      issues.push({
        wrong: m[0],
        right,
        context: ctx,
        textStart: matchIndex,
        textEnd: matchIndex + matchLen,
      });
      if (issues.length >= 12) return issues;
    }
  }
  return issues;
}

/** Optional nspell enrichment (lazy CDN). No-ops if unavailable. */
async function enrichSpellingWithNspell(text, lang, issues, whitelist) {
  try {
    if (typeof window === "undefined") return issues;
    const load = window.__atsLoadNspell;
    if (typeof load !== "function") return issues;
    const spell = await load(lang);
    if (!spell?.correct) return issues;
    const seen = new Set(issues.map((i) => i.wrong.toLowerCase()));
    const words = text.match(/[A-Za-zÀ-ü](?:[A-Za-zÀ-ü\-]*[A-Za-zÀ-ü])?/g) || [];
    for (const w of words) {
      if (w.length < 3) continue;
      const low = w.toLowerCase();
      if (seen.has(low)) continue;
      if (whitelist?.has(low)) continue;
      if (/^\d/.test(w)) continue;
      if (/^[A-Z]{2,}$/.test(w)) continue;
      if (spell.correct(w)) continue;
      const suggestions = spell.suggest?.(w) || [];
      if (!suggestions.length) continue;
      const idx = text.indexOf(w);
      if (idx < 0) continue;
      seen.add(low);
      issues.push({
        wrong: w,
        right: suggestions[0],
        context: text.slice(Math.max(0, idx - 20), idx + w.length + 20).replace(/\s+/g, " "),
        textStart: idx,
        textEnd: idx + w.length,
      });
      if (issues.length >= 20) break;
    }
  } catch {
    /* nspell optional */
  }
  return issues;
}

/**
 * Localise un extrait dans le texte plat.
 * @returns {{ textStart: number, textEnd: number, quote: string }|null}
 */
function locateQuote(text, quote, fromIndex = 0) {
  if (!quote) return null;
  const idx = text.indexOf(quote, fromIndex);
  if (idx === -1) {
    const soft = text.toLowerCase().indexOf(quote.toLowerCase(), fromIndex);
    if (soft === -1) return null;
    return { textStart: soft, textEnd: soft + quote.length, quote: text.slice(soft, soft + quote.length) };
  }
  return { textStart: idx, textEnd: idx + quote.length, quote };
}

function sectionAnchor(text, kind, parsed) {
  // Prefer structured section headings over anywhere-in-text matches
  if (parsed?.lines?.length) {
    const headerKeys = {
      experience: /exp[ée]rience|work\s+experience|professional/i,
      education: /formation|education|éducation|dipl[ôo]me/i,
      skills: /comp[ée]tence|skills|technologies|outils/i,
      languages: /langues?|languages?/i,
      summary: /profil|r[ée]sum[ée]|summary|objectif/i,
    };
    const re = headerKeys[kind];
    if (re) {
      for (const line of parsed.lines) {
        const t = (line.text || "").replace(/[:：]\s*$/, "").trim();
        if (t.length <= 48 && re.test(t) && (line.textStart != null || line.textStart === 0)) {
          const start = line.textStart ?? text.indexOf(line.text);
          if (start >= 0) {
            return {
              textStart: start,
              textEnd: start + (line.text?.length || t.length),
              quote: line.text,
            };
          }
        }
      }
    }
  }
  const re = SECTION_PATTERNS[kind];
  if (!re) return null;
  // Line-start only to avoid false positives (« formation » in a bullet)
  const lineRe = new RegExp(`(?:^|\\n)\\s*(${re.source})`, re.flags.includes("i") ? "im" : "m");
  const m = lineRe.exec(text);
  if (!m) return null;
  const quote = m[1] || m[0];
  const idx = m.index + m[0].indexOf(quote);
  return { textStart: idx, textEnd: idx + quote.length, quote };
}

/**
 * Détecte l'outil d'origine du CV (Canva, IA, builders en ligne…) via metadata PDF /
 * nom de fichier / watermarks texte (pieds de page).
 * @param {{ fileName?: string, pdfCreator?: string|null, pdfProducer?: string|null, text?: string }} fileMeta
 * @returns {{ id: string, label: string, hostile: boolean, evidence: string, via?: string }}
 */
export function detectCvSource(fileMeta = {}) {
  const metaBlob = [fileMeta.pdfCreator, fileMeta.pdfProducer, fileMeta.fileName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const rawText = String(fileMeta.text || "");
  // Sample head + tail — watermarks often live in footers
  const textBlob =
    rawText.length > 0
      ? `${rawText.slice(0, 2000)} ${rawText.slice(-1200)}`.toLowerCase()
      : "";

  const hitMeta = (re) => {
    const m = metaBlob.match(re);
    return m ? m[0] : null;
  };
  const hitText = (re) => {
    if (!textBlob) return null;
    const m = textBlob.match(re);
    return m ? m[0] : null;
  };

  const canva =
    hitMeta(/\bcanva\b/) ||
    hitText(/made\s+with\s+canva|cr[ée]{1,2}\s+avec\s+canva|designed\s+with\s+canva|\bcanva\.com\b/);
  if (canva) {
    return {
      id: "canva",
      label: "Canva",
      hostile: true,
      evidence: canva,
      via: hitMeta(/\bcanva\b/) ? "meta" : "text",
    };
  }

  const ai =
    hitMeta(/\bchatgpt\b/) ||
    hitMeta(/\bgpt-?\d*\b/) ||
    hitMeta(/\bopenai\b/) ||
    hitMeta(/\bclaude\b/) ||
    hitMeta(/\banthropic\b/) ||
    hitMeta(/\bcopilot\b/) ||
    hitMeta(/\bgemini\b/) ||
    hitMeta(/\bnotion\s*ai\b/) ||
    hitMeta(/\bgamma\b/) ||
    hitMeta(/\bbeautiful\.?ai\b/) ||
    hitText(
      /generated\s+by\s+chatgpt|g[ée]n[ée]r[ée]\s+par\s+chatgpt|chatgpt\.com|openai\.com|claude\.ai|made\s+with\s+gamma|beautiful\.ai/
    );
  if (ai) {
    return {
      id: "ai_builder",
      label: /chatgpt|gpt|openai/i.test(ai)
        ? "ChatGPT"
        : /claude|anthropic/i.test(ai)
          ? "Claude"
          : /gemini/i.test(ai)
            ? "Gemini"
            : /gamma/i.test(ai)
              ? "Gamma"
              : ai,
      hostile: true,
      evidence: ai,
      via: hitMeta(/\b(chatgpt|openai|claude|gemini|gamma|copilot)\b/) ? "meta" : "text",
    };
  }

  const builder =
    hitMeta(/\bkickresume\b/) ||
    hitMeta(/\bnovoresume\b/) ||
    hitMeta(/\benhancv\b/) ||
    hitMeta(/\bteal\b/) ||
    hitMeta(/\bresume\.io\b/) ||
    hitMeta(/\bvisualcv\b/) ||
    hitMeta(/\bflowcv\b/) ||
    hitMeta(/\bcvmaker\b/) ||
    hitMeta(/\bresumegenius\b/) ||
    hitMeta(/\bzety\b/) ||
    hitMeta(/\brezi\b/) ||
    hitText(
      /\bkickresume\b|\bnovoresume\b|\benhancv\b|\bresume\.io\b|\bvisualcv\b|\bflowcv\b|\bzety\b|\brezi\.ai\b/
    );
  if (builder) {
    return {
      id: "online_builder",
      label: builder,
      hostile: true,
      evidence: builder,
      via: hitMeta(/\bkickresume|novoresume|enhancv|resume\.io|zety|rezi\b/) ? "meta" : "text",
    };
  }

  // Favorable sources — metadata / filename only (avoid matching body text like "context")
  if (hitMeta(/\blatex\b/) || hitMeta(/\bxelatex\b/) || hitMeta(/\bpdftitlefont\b/) || hitMeta(/\btex\b/)) {
    return { id: "latex", label: "LaTeX", hostile: false, evidence: "latex", via: "meta" };
  }
  if (hitMeta(/\bmicrosoft\b/) || hitMeta(/\bword\b/) || hitMeta(/\bwps\b/) || hitMeta(/\blibreoffice\b/)) {
    return { id: "word", label: "Word", hostile: false, evidence: "word", via: "meta" };
  }
  if (hitMeta(/\bgoogle\b/) || hitMeta(/\bdocs\b/)) {
    return { id: "google_docs", label: "Google Docs", hostile: false, evidence: "google", via: "meta" };
  }

  return { id: "unknown", label: "", hostile: false, evidence: "", via: "" };
}

/**
 * Profil document unifié : format, origine, extractibilité, layout.
 * @param {object} fileMeta
 * @param {object|null} [layout]
 * @param {string} [text]
 */
export function detectDocumentProfile(fileMeta = {}, layout = null, text = "") {
  const name = String(fileMeta.fileName || "").toLowerCase();
  const ft = String(fileMeta.fileType || fileMeta.format || "").toLowerCase();
  let format = "unknown";
  if (fileMeta.format === "pdf" || ft.includes("pdf") || name.endsWith(".pdf")) format = "pdf";
  else if (fileMeta.format === "docx" || ft.includes("wordprocessingml") || name.endsWith(".docx"))
    format = "docx";
  else if (fileMeta.format === "txt" || ft.startsWith("text/") || name.endsWith(".txt")) format = "txt";

  const origin = detectCvSource({ ...fileMeta, text });
  const len = String(text || "").replace(/\s/g, "").length;
  const weirdChars = (String(text || "").match(/[□�]|[\uFFFD]/g) || []).length;
  const imageOnlyPages = Array.isArray(fileMeta.imageOnlyPages)
    ? fileMeta.imageOnlyPages
    : Array.isArray(layout?.imageOnlyPages)
      ? layout.imageOnlyPages
      : [];

  const hasColumnsSmell = layout
    ? !!layout.columnSmell
    : (String(text || "").match(/\t{2,}| {8,}/g) || []).length > 12;
  const hasTables = !!(layout?.tableHint || fileMeta.tableHint);
  const headerSparse = !!(layout?.headerSparse || fileMeta.headerSparse);
  const readingOrderOk = layout?.readingOrderOk !== false && fileMeta.readingOrderOk !== false;

  /** PDF scan signal only — DOCX/TXT approximate must not imply scan */
  const pdfScanSignal =
    format === "pdf" && !!fileMeta.approximate && len < 120 && imageOnlyPages.length === 0;

  let extractability = "text";
  // Image pages / PDF scan take priority over generic "unreadable"
  if (imageOnlyPages.length > 0 || pdfScanSignal) extractability = "scan_like";
  else if (len < 40 || weirdChars >= 10) extractability = "unreadable";
  else if (len < 80) extractability = "sparse";

  let confidence = "medium";
  const hasMeta = !!(fileMeta.pdfCreator || fileMeta.pdfProducer);
  if (extractability === "text" && (hasMeta || origin.id !== "unknown" || format === "docx")) {
    confidence = "high";
  } else if (extractability === "scan_like" || extractability === "unreadable") {
    confidence = "low";
  } else if (origin.via === "text" || origin.via === "meta") {
    confidence = "high";
  }

  return {
    format,
    origin,
    extractability,
    layoutFlags: {
      hasTables,
      hasColumnsSmell,
      headerSparse,
      readingOrderOk,
    },
    confidence,
    imageOnlyPages,
    weirdChars,
  };
}

/**
 * Construit des annotations localisées (offsets + quote) à partir du rapport.
 * Titres / details / suggestions concrets — pas de faux chiffres ni phrases bateau.
 * Les rects PDF sont enrichis plus tard via attachGeometry().
 */
function buildAnnotations(text, scores, spelling, lang, parsed = null) {
  const annotations = [];
  let seq = 0;
  const nextId = () => `ann-${++seq}`;
  const isEn = lang === "en";

  const push = (partial) => {
    annotations.push({
      id: nextId(),
      page: 1,
      rects: [],
      approximate: true,
      status: "pending",
      section: partial.section || guessSection(text, partial.textStart || 0),
      axis: partial.axis || "content",
      shortLabel: partial.shortLabel || shortLabelFor(partial.kind),
      ...partial,
    });
  };

  const cvSource = scores.readability?.cvSource;
  if (cvSource?.hostile) {
    const tool = cvSource.label || cvSource.id;
    push({
      kind: "cv_source",
      axis: "readability",
      shortLabel: isEn ? "Source" : "Source",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "CV",
      title: isEn
        ? `CV likely built with ${tool} — credibility & ATS risk`
        : `CV probablement créé avec ${tool} — risque ATS et crédibilité`,
      detail: isEn
        ? `Design tools and AI resume builders often produce graphic layouts ATS cannot parse reliably, and recruiters may distrust generic AI-looking CVs. Rebuild in Word or Google Docs as plain selectable text, single column, no banners.`
        : `Les outils de design et builders IA produisent souvent des mises en page graphiques mal lues par les ATS, et les recruteurs peuvent douter d’un CV « généré ». Reprenez sous Word ou Google Docs en texte sélectionnable, une colonne, sans bandeaux.`,
      suggestion: isEn
        ? "Word/Google Docs → single column → File → Download as PDF (text, not image)."
        : "Word/Google Docs → une colonne → Fichier → Télécharger en PDF (texte, pas image).",
      applyMode: "replace",
      approximate: true,
      checkId: "cv_source",
    });
  }

  for (const s of spelling) {
    const ctx = (s.context || "").replace(/\s+/g, " ").trim();
    const isGrammar = s.kind === "grammar";
    push({
      kind: isGrammar ? "grammar" : "typo",
      axis: "content",
      shortLabel: isGrammar
        ? isEn
          ? "Grammar"
          : "Grammaire"
        : isEn
          ? "Spelling"
          : "Orthographe",
      severity: isGrammar ? "warning" : "critical",
      textStart: s.textStart,
      textEnd: s.textEnd,
      quote: s.wrong,
      title: isEn
        ? `Fix « ${s.wrong} » → « ${s.right} »`
        : `Corriger « ${s.wrong} » → « ${s.right} »`,
      detail: ctx
        ? isEn
          ? `Found here: ${ctx}`
          : `Repéré ici : ${ctx}`
        : isEn
          ? "Replace this wording on your CV."
          : "Remplacez cette formulation telle qu'elle apparaît sur votre CV.",
      suggestion: s.right,
      applyMode: "replace",
      approximate: false,
      checkId: isGrammar ? "grammar_quality" : "spelling_quality",
    });
  }

  if (!detectEmail(text)) {
    push({
      kind: "missing_email",
      axis: "structure",
      shortLabel: "Email",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(début du CV)",
      title: isEn ? "Add your email at the top" : "Ajouter votre e-mail en tête",
      detail: isEn
        ? "No email found in plain text. Edit the field below with your real address, then accept."
        : "Aucun e-mail détecté en texte clair. Remplacez le champ ci-dessous par votre vraie adresse, puis acceptez.",
      suggestion: "[votre.email@domaine.fr]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "email",
    });
  }
  if (!detectPhone(text)) {
    push({
      kind: "missing_phone",
      axis: "structure",
      shortLabel: isEn ? "Phone" : "Téléphone",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(début du CV)",
      title: isEn ? "Add your phone number" : "Ajouter votre numéro de téléphone",
      detail: isEn
        ? "No phone recognized. Put your real number in plain text in the header (not in an image)."
        : "Aucun téléphone reconnu. Indiquez votre vrai numéro en texte en tête de CV (pas dans une image).",
      suggestion: "[06 XX XX XX XX]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "phone",
    });
  }

  const missingSections = [
    {
      key: "experience",
      kind: "missing_section",
      shortLabel: isEn ? "Experience" : "Expérience",
      title: isEn ? "Add an Experience section" : "Ajouter une section Expérience",
      block: isEn
        ? "EXPERIENCE\nJob title — Company (YYYY – YYYY)\n- Led …\n- Delivered … [metric: % or volume]"
        : "EXPÉRIENCE PROFESSIONNELLE\nIntitulé — Entreprise (AAAA – AAAA)\n- Piloté …\n- Réalisé … [chiffre : % ou volume]",
      detail: isEn
        ? "No Experience heading detected. Add a real job title, company, dates, and 2 bullets with your results."
        : "Aucun titre Expérience détecté. Ajoutez un intitulé réel, l'entreprise, les dates, et 2 puces avec vos résultats.",
    },
    {
      key: "education",
      kind: "missing_section",
      shortLabel: isEn ? "Education" : "Formation",
      title: isEn ? "Add an Education section" : "Ajouter une section Formation",
      block: isEn
        ? "EDUCATION\nDegree — School (YYYY – YYYY)"
        : "FORMATION\nDiplôme — Établissement (AAAA – AAAA)",
      detail: isEn
        ? "No Education heading found. Use your real degree and school names."
        : "Aucun titre Formation trouvé. Utilisez vos vrais diplôme et établissement.",
    },
    {
      key: "skills",
      kind: "missing_section",
      shortLabel: isEn ? "Skills" : "Compétences",
      title: isEn ? "Add a Skills section" : "Ajouter une section Compétences",
      block: isEn
        ? "SKILLS\n[tool], [method], [domain] — list skills you actually use"
        : "COMPÉTENCES\n[outil], [méthode], [domaine] — listez les compétences que vous maîtrisez vraiment",
      detail: isEn
        ? "No Skills heading found. List tools and methods from your recent roles."
        : "Aucun titre Compétences trouvé. Listez outils et méthodes de vos postes récents.",
    },
  ];
  for (const ms of missingSections) {
    // Heading-only: never treat « formation » inside a bullet as a section
    if (!hasParsedSection(parsed, ms.key)) {
      const end = text.length;
      push({
        kind: ms.kind,
        axis: "structure",
        shortLabel: ms.shortLabel,
        severity: ms.key === "experience" ? "critical" : "warning",
        textStart: Math.max(0, end - 1),
        textEnd: end,
        quote: "(fin du document)",
        title: ms.title,
        detail: ms.detail,
        suggestion: ms.block.trim(),
        applyMode: "insert_after",
        section: "Document",
        approximate: true,
        checkId: `section_${ms.key}`,
      });
    }
  }

  const passiveRe = /\bresponsable\s+de\s+[^.!\n]{8,120}/gi;
  let pm;
  let passiveCount = 0;
  const expBlob = (parsed?.sections?.experience || []).join("\n");
  const passiveHay = expBlob && expBlob.length >= 40 ? expBlob : text;
  while ((pm = passiveRe.exec(passiveHay)) !== null && passiveCount < 6) {
    const quote = pm[0].trim();
    const suggestion = quote
      .replace(/^responsable\s+de\s+/i, isEn ? "Led " : "Piloté ")
      .replace(/^./, (c) => c.toUpperCase());
    const loc = locateQuote(text, quote) || {
      textStart: pm.index,
      textEnd: pm.index + pm[0].length,
      quote,
    };
    push({
      kind: "passive_verb",
      axis: "content",
      shortLabel: isEn ? "Verb" : "Verbe",
      severity: "warning",
      textStart: loc.textStart,
      textEnd: loc.textEnd,
      quote: loc.quote,
      title: isEn
        ? `Replace « ${quote.slice(0, 42)}${quote.length > 42 ? "…" : ""} »`
        : `Remplacer « ${quote.slice(0, 42)}${quote.length > 42 ? "…" : ""} »`,
      detail: isEn
        ? "This experience line describes a duty, not an action. Swap to a strong verb on the same task."
        : "Cette ligne d'expérience décrit une tâche, pas une action. Remplacez par un verbe d'action sur la même mission.",
      suggestion,
      applyMode: "replace",
      approximate: false,
      checkId: "weak_verbs",
    });
    passiveCount += 1;
  }

  const weakFromLex = scores.content?.verbWeakHits || [];
  for (const wh of weakFromLex.slice(0, 4)) {
    if (passiveCount >= 6) break;
    const quote = String(wh.quote || "").trim();
    if (!quote) continue;
    const idx = typeof wh.index === "number" ? wh.index : text.toLowerCase().indexOf(quote.toLowerCase());
    if (idx < 0) continue;
    // Skip if we already annotated overlapping span
    if (
      annotations.some(
        (a) =>
          a.kind === "passive_verb" &&
          idx < a.textEnd &&
          idx + quote.length > a.textStart
      )
    ) {
      continue;
    }
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const lineEndIdx = text.indexOf("\n", idx);
    const fullLine = text.slice(lineStart, lineEndIdx < 0 ? undefined : lineEndIdx).trim();
    const replacement = String(
      (wh.suggestion || "").replace(/\s*…\s*$/, "").trim() || (isEn ? "Led" : "Piloté")
    );
    const weakTok = String(wh.weak || quote).trim();
    let suggestion = fullLine;
    if (weakTok && fullLine) {
      const re = new RegExp(escapeReg(weakTok), "i");
      if (re.test(fullLine)) {
        suggestion = fullLine.replace(re, replacement).replace(/^./, (c) => c.toUpperCase());
      } else {
        suggestion = fullLine.replace(quote, replacement);
      }
    } else {
      suggestion = String(wh.suggestion || (isEn ? "Led …" : "Piloté …"));
    }
    push({
      kind: "passive_verb",
      axis: "content",
      shortLabel: isEn ? "Verb" : "Verbe",
      severity: "warning",
      textStart: idx,
      textEnd: idx + quote.length,
      quote: fullLine.slice(0, 120) || quote,
      title: isEn
        ? `Weak verb « ${weakTok || quote} » — prefer an action verb`
        : `Verbe faible « ${weakTok || quote} » — préférez un verbe d'action`,
      detail: isEn
        ? `« ${weakTok || quote} » is a weak formulation in Experience. Replace with a concrete action verb keeping the rest of the bullet.`
        : `« ${weakTok || quote} » est une formulation faible en Expérience. Remplacez par un verbe d'action en gardant le reste de la puce.`,
      suggestion,
      applyMode: "replace",
      approximate: false,
      checkId: "weak_verbs",
    });
    passiveCount += 1;
  }

  if (!scores.content.hasMetrics) {
    const bulletRe = /^[\s•\-\*]+(.{20,160})$/gm;
    const metricHay = expBlob && expBlob.length >= 40 ? expBlob : text;
    let bm;
    let metricAnns = 0;
    const roleForBullet = (line) =>
      (parsed?.roles || []).find((r) => (r.bullets || []).some((b) => b.includes(line.slice(0, 40))));
    while ((bm = bulletRe.exec(metricHay)) !== null && metricAnns < 4) {
      const line = bm[1].trim();
      if (bulletHasResultMetric(line)) continue;
      if (!/[a-záàâäéèêëíìîïóòôöúùûüç]/i.test(line)) continue;
      const role = roleForBullet(line);
      const roleHint = role?.title
        ? isEn
          ? ` for « ${role.title} »`
          : ` pour « ${role.title} »`
        : "";
      const suggestion = `${line.replace(/\.$/, "")} [${
        isEn
          ? `metric${roleHint}: % or volume you owned`
          : `chiffre${roleHint} : % ou volume dont vous êtes responsable`
      }]`;
      const loc = locateQuote(text, line) || {
        textStart: bm.index,
        textEnd: bm.index + bm[0].length,
        quote: line.slice(0, 100),
      };
      push({
        kind: "missing_metric",
        axis: "content",
        shortLabel: isEn ? "Metric" : "Chiffre",
        severity: "warning",
        textStart: loc.textStart,
        textEnd: loc.textEnd,
        quote: loc.quote.slice(0, 100),
        title: isEn ? "Add a metric to this experience bullet" : "Ajouter un chiffre à cette puce d'expérience",
        detail: isEn
          ? `This experience bullet has no number${roleHint}. Replace the bracket with a real KPI from that role (%, €, headcount, delay).`
          : `Cette puce d'expérience n'a aucun chiffre${roleHint}. Remplacez le crochet par un vrai KPI de ce poste (%, €, effectif, délai).`,
        suggestion,
        applyMode: "replace",
        approximate: false,
        checkId: "metrics",
      });
      metricAnns += 1;
    }
    if (metricAnns === 0) {
      const exp =
        sectionAnchor(text, "experience", parsed) || {
          textStart: 0,
          textEnd: Math.min(60, text.length),
          quote: text.slice(0, 40),
        };
      const topRole = parsed?.roles?.[0]?.title;
      push({
        kind: "missing_metric",
        axis: "content",
        shortLabel: isEn ? "Metric" : "Chiffre",
        severity: "warning",
        ...exp,
        title: isEn ? "Add quantified results to recent roles" : "Chiffrer les expériences récentes",
        detail: isEn
          ? "No metrics detected on experience bullets. Pick 2–3 recent bullets and add a real KPI you can defend in interview."
          : "Aucun chiffre détecté sur les puces d'expérience. Choisissez 2–3 puces récentes et ajoutez un KPI réel que vous pouvez défendre en entretien.",
        suggestion: isEn
          ? `- [${topRole ? `Action as ${topRole}` : "Action"}] … ([metric: % / volume / €])`
          : `- [${topRole ? `Action en tant que ${topRole}` : "Action"}] … ([chiffre : % / volume / €])`,
        applyMode: "insert_after",
        approximate: true,
        checkId: "metrics",
      });
    }
  }

  // Bridge: action verbs without metrics on recent bullets
  const actionWithout = (scores.content?.checks || []).find(
    (c) => c.id === "action_without_metric" && c.ok === false
  );
  if (actionWithout) {
    const ACTION_LINE =
      /\b(pilot[ée]|dirig[ée]|d[ée]velopp[ée]|optimis[ée]|augment[ée]|r[ée]duit[e]?|lanc[ée]|cr[ée][ée]|mis en place|led|managed|developed|designed|created|launched|improved|optimized|increased|reduced|built|delivered|achieved)\b/i;
    let bridged = 0;
    for (const role of (parsed?.roles || []).slice(0, 2)) {
      for (const b of role.bullets || []) {
        if (bridged >= 2) break;
        if (!ACTION_LINE.test(b) || bulletHasResultMetric(b)) continue;
        if (annotations.some((a) => a.checkId === "metrics" && a.quote && b.includes(a.quote.slice(0, 30))))
          continue;
        const loc = locateQuote(text, b) || {
          textStart: 0,
          textEnd: Math.min(40, text.length),
          quote: b.slice(0, 100),
        };
        push({
          kind: "missing_metric",
          axis: "content",
          shortLabel: isEn ? "Impact" : "Impact",
          severity: "warning",
          textStart: loc.textStart,
          textEnd: loc.textEnd,
          quote: loc.quote.slice(0, 100),
          title: isEn
            ? "Action verb without a metric — credit the impact"
            : "Verbe d'action sans chiffre — créditez l'impact",
          detail: isEn
            ? `This bullet starts strong but lacks a KPI${role.title ? ` (« ${role.title} »)` : ""}. Add %, €, volume or delay you can defend.`
            : `Cette puce démarre bien mais sans KPI${role.title ? ` (« ${role.title} »)` : ""}. Ajoutez %, €, volume ou délai défendable.`,
          suggestion: `${b.replace(/\.$/, "")} [${isEn ? "metric: % / volume / €" : "chiffre : % / volume / €"}]`,
          applyMode: "replace",
          approximate: false,
          checkId: "action_without_metric",
        });
        bridged += 1;
      }
      if (bridged >= 2) break;
    }
  }

  // Bridge: too few action verbs overall
  const actionVerbsKo = (scores.content?.checks || []).find(
    (c) => c.id === "action_verbs" && c.ok === false
  );
  if (actionVerbsKo && !annotations.some((a) => a.checkId === "weak_verbs" || a.kind === "passive_verb")) {
    const exp =
      sectionAnchor(text, "experience", parsed) || {
        textStart: 0,
        textEnd: Math.min(60, text.length),
        quote: text.slice(0, 40),
      };
    push({
      kind: "passive_verb",
      axis: "content",
      shortLabel: isEn ? "Verbs" : "Verbes",
      severity: "warning",
      ...exp,
      title: isEn ? "Strengthen action verbs in Experience" : "Renforcer les verbes d'action en Expérience",
      detail: isEn
        ? "Few strong action verbs detected. Start recent bullets with led / built / delivered / improved + a real outcome."
        : "Peu de verbes d'action forts détectés. Commencez les puces récentes par piloté / développé / livré / amélioré + un résultat réel.",
      suggestion: isEn
        ? "- Led / Built / Delivered … ([metric])"
        : "- Piloté / Développé / Livré … ([chiffre])",
      applyMode: "insert_after",
      approximate: true,
      checkId: "action_verbs",
    });
  }

  // Bridge: concision
  const concisionKo = (scores.content?.checks || []).find((c) => c.id === "concision" && c.ok === false);
  if (concisionKo) {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const tooShort = wordCount < 200;
    push({
      kind: "length",
      axis: "content",
      shortLabel: isEn ? "Length" : "Longueur",
      severity: "info",
      textStart: tooShort ? 0 : Math.max(0, text.length - 80),
      textEnd: tooShort ? Math.min(60, text.length) : text.length,
      quote: (tooShort ? text.slice(0, 60) : text.slice(Math.max(0, text.length - 80))).trim(),
      title: tooShort
        ? isEn
          ? `Content too short (~${wordCount} words)`
          : `Contenu trop court (~${wordCount} mots)`
        : isEn
          ? `Dense content (~${wordCount} words) — streamline`
          : `Contenu dense (~${wordCount} mots) — allégez`,
      detail: tooShort
        ? isEn
          ? "Add 2–4 concrete bullets under recent roles (verb + metric + context)."
          : "Ajoutez 2–4 puces concrètes sous les rôles récents (verbe + chiffre + contexte)."
        : isEn
          ? "Cut older roles to title + 1 bullet; drop redundant soft-skill lists."
          : "Réduisez les postes anciens à intitulé + 1 puce ; retirez les listes soft redondantes.",
      suggestion: tooShort
        ? isEn
          ? "- [Action verb] … ([metric])"
          : "- [Verbe d'action] … ([chiffre])"
        : isEn
          ? "Cut older roles to title + 1 bullet; drop redundant soft-skill lists."
          : "Réduire postes anciens à intitulé + 1 puce ; retirer listes soft redondantes.",
      applyMode: tooShort ? "insert_after" : "replace",
      approximate: true,
      checkId: "concision",
    });
  }

  // Role pack hard keywords missing
  const roleGaps = scores.keywords?.roleKeywordGaps;
  if (roleGaps?.role && roleGaps.missing?.length) {
    const skills = sectionAnchor(text, "skills", parsed);
    const missingList = roleGaps.missing.slice(0, 5);
    const suggestion = isEn
      ? `Skills / tools: ${missingList.join(", ")}`
      : `Compétences / outils : ${missingList.join(", ")}`;
    push({
      kind: "role_keywords",
      axis: "keywords",
      shortLabel: isEn ? "Role pack" : "Pack métier",
      severity: "warning",
      textStart: skills?.textStart ?? Math.max(0, text.length - 1),
      textEnd: skills?.textEnd ?? text.length,
      quote: skills?.quote || "(compétences)",
      title: isEn
        ? `Add hard skills for « ${roleGaps.role} »`
        : `Ajouter des termes hard du pack « ${roleGaps.role} »`,
      detail: isEn
        ? `Missing from your CV vs the inferred role pack: ${missingList.join(", ")}. Only add tools you actually use.`
        : `Manquants vs le pack de rôle inféré : ${missingList.join(", ")}. N'ajoutez que des outils que vous maîtrisez vraiment.`,
      suggestion,
      applyMode: "insert_after",
      approximate: true,
      checkId: "role_keywords",
    });
  }

  // Gaps: employment roles only (no year-soup fallback)
  const empGaps = scores.structure?.employmentGaps || parsed?.employmentGaps || [];
  const gap = empGaps[0];
  if (gap) {
    const yearQuote = String(gap.from);
    const loc = locateQuote(text, yearQuote) || { textStart: 0, textEnd: 4, quote: yearQuote };
    push({
      kind: "gap",
      axis: "structure",
      shortLabel: "Gap",
      severity: gap.months >= 24 ? "warning" : "info",
      textStart: loc.textStart,
      textEnd: loc.textEnd,
      quote: loc.quote,
      title: isEn
        ? `Explain the ${gap.from}–${gap.to} gap (~${gap.months} mo.)`
        : `Expliquer le trou ${gap.from}–${gap.to} (~${gap.months} mois)`,
      detail: isEn
        ? "Insert one line between those roles stating what you did (training, project, volunteering, business)."
        : "Insérez une ligne entre ces postes précisant l'activité (formation, projet, bénévolat, création).",
      suggestion: isEn
        ? `${gap.from}–${gap.to} — [training / project / volunteering]: [what you built or learned]`
        : `${gap.from}–${gap.to} — [formation / projet / bénévolat] : [ce que vous avez réalisé ou appris]`,
      applyMode: "insert_after",
      approximate: true,
      checkId: "employment_gap",
    });
  }

  if (
    scores.keywords.keywords.length < 8 ||
    (scores.keywords.jdOverlap && scores.keywords.jdOverlap.score < 50)
  ) {
    const skills = sectionAnchor(text, "skills", parsed);
    const jd = scores.keywords.jdOverlap;
    const roleGaps = scores.keywords?.roleKeywordGaps;
    let terms = [];
    const lower = text.toLowerCase();
    const hasTerm = (t) => {
      const k = String(t).toLowerCase();
      if (k.length < 3) return true;
      if (scores.keywords.keywords.map((x) => String(x).toLowerCase()).includes(k)) return true;
      const re = new RegExp(`\\b${escapeReg(k)}\\b`, "i");
      return re.test(lower);
    };
    if (jd?.mustMissing?.length) {
      terms = jd.mustMissing.filter((t) => !hasTerm(t)).slice(0, 5);
    } else if (jd?.jdTerms?.length) {
      terms = jd.jdTerms.filter((t) => !hasTerm(t)).slice(0, 5);
    } else if (roleGaps?.missing?.length) {
      terms = roleGaps.missing.filter((t) => !hasTerm(t)).slice(0, 5);
    }
    if (!terms.length) {
      // Hard-only fallback — never suggest soft stuffing as "required skills"
      terms = HARD_FALLBACK_KEYWORDS.filter((k) => k.length >= 3 && !hasTerm(k)).slice(0, 5);
    }
    if (terms.length) {
      const anchor =
        skills || {
          textStart: Math.max(0, text.length - 1),
          textEnd: text.length,
          quote: "(compétences)",
        };
      const line = terms.join(" · ");
      const mustCov = jd?.mustCoverage;
      push({
        kind: "keyword",
        axis: "keywords",
        shortLabel: isEn ? "Keywords" : "Mots-clés",
        severity: jd?.mustMissing?.length ? "warning" : "info",
        textStart: anchor.textStart,
        textEnd: anchor.textEnd,
        quote: anchor.quote,
        title: isEn
          ? `Add required skills: ${terms.slice(0, 3).join(", ")}`
          : `Ajouter les compétences requises : ${terms.slice(0, 3).join(", ")}`,
        detail:
          jd?.score != null
            ? isEn
              ? `Job↔CV overlap ${jd.score}%${mustCov != null ? ` (must-have coverage ${mustCov}%)` : ""}. Missing required terms: ${terms.join(", ")}. Only keep terms you actually master.`
              : `Alignement offre↔CV ${jd.score} %${mustCov != null ? ` (couverture must ${mustCov} %)` : ""}. Termes requis absents : ${terms.join(", ")}. Ne gardez que ceux que vous maîtrisez vraiment.`
            : isEn
              ? "These hard skills are weak or missing vs. typical target roles. Append only those you use."
              : "Ces compétences hard sont absentes ou faibles par rapport aux offres types. N'ajoutez que celles que vous utilisez.",
        suggestion: isEn ? `Skills: ${line}` : `Compétences : ${line}`,
        applyMode: "insert_after",
        section: "Compétences",
        approximate: !skills,
        checkId: jd?.mustMissing?.length ? "jd_overlap" : "keyword_density",
      });
    }
  }

  // One annotation per top must-missing (cap 3) — weave into recent experience / skills
  {
    const jd = scores.keywords?.jdOverlap;
    const musts = (jd?.mustMissing || []).slice(0, 3);
    const skills = sectionAnchor(text, "skills", parsed);
    const recentRole = parsed?.roles?.[0];
    let mustIdx = 0;
    for (const term of musts) {
      mustIdx += 1;
      const already =
        annotations.some(
          (a) =>
            (a.checkId === "jd_overlap" || a.kind === "keyword") &&
            String(a.suggestion || a.title || "")
              .toLowerCase()
              .includes(String(term).toLowerCase())
        ) && mustIdx === 1;
      // Still emit focused must tips; skip only pure duplicates of same title
      if (
        annotations.some(
          (a) => a.kind === "jd_must" && String(a.title || "").toLowerCase().includes(String(term).toLowerCase())
        )
      ) {
        continue;
      }
      void already;
      const anchorBullet = (recentRole?.bullets || []).find((b) => b && b.length > 20);
      const loc = anchorBullet
        ? locateQuote(text, anchorBullet) || skills
        : skills || {
            textStart: Math.max(0, text.length - 1),
            textEnd: text.length,
            quote: "(compétences)",
          };
      const weave = anchorBullet
        ? `${anchorBullet.replace(/\.$/, "")} — ${term}`
        : isEn
          ? `Skills: ${term}`
          : `Compétences : ${term}`;
      push({
        kind: "jd_must",
        axis: "keywords",
        shortLabel: isEn ? "Must" : "Must",
        severity: "warning",
        textStart: loc?.textStart ?? 0,
        textEnd: loc?.textEnd ?? Math.min(40, text.length),
        quote: (loc?.quote || String(term)).slice(0, 100),
        title: isEn
          ? `Missing must-have « ${term} » — weave into Experience if true`
          : `Must absent « ${term} » — intégrez-le en Expérience s'il est vrai`,
        detail: isEn
          ? `Job match lists « ${term} » as a missing must-have. Add it only if you actually used it — do not invent experience.`
          : `Le matching liste « ${term} » comme must absent. Ajoutez-le uniquement si vous l'avez réellement utilisé — n'inventez pas d'expérience.`,
        suggestion: weave,
        applyMode: "replace",
        approximate: !loc || loc.quote === "(compétences)",
        checkId: "jd_overlap",
      });
    }
  }

  // Soft-stuffing annotation
  const softStuff = (scores.keywords?.checks || []).find((c) => c.id === "keyword_soft_stuffing" && c.ok === false);
  if (softStuff) {
    const skills = sectionAnchor(text, "skills", parsed);
    const softList = (scores.keywords?.softHits || []).slice(0, 5);
    const jd = scores.keywords?.jdOverlap;
    const roleGaps = scores.keywords?.roleKeywordGaps;
    const hardFill =
      (jd?.mustMissing || []).slice(0, 4).join(" · ") ||
      (roleGaps?.missing || []).slice(0, 4).join(" · ") ||
      HARD_FALLBACK_KEYWORDS.slice(0, 4).join(" · ");
    push({
      kind: "keyword",
      axis: "keywords",
      shortLabel: isEn ? "Soft stuffing" : "Soft stuffing",
      severity: "warning",
      textStart: skills?.textStart ?? 0,
      textEnd: skills?.textEnd ?? Math.min(40, text.length),
      quote: skills?.quote || softList.join(", ") || "(compétences)",
      title: isEn
        ? "Too many soft skills, too few hard tools"
        : "Trop de soft skills, trop peu d'outils hard",
      detail: isEn
        ? `Soft terms dominate (${softList.join(", ") || "soft skills"}). ATS Boolean filters look for concrete tools/methods — add hard skills you use daily.`
        : `Les termes soft dominent (${softList.join(", ") || "soft skills"}). Les filtres booléens ATS cherchent des outils/méthodes concrets — ajoutez des hard skills de votre quotidien.`,
      suggestion: isEn ? `Skills: ${hardFill}` : `Compétences : ${hardFill}`,
      applyMode: "insert_after",
      approximate: !skills,
      checkId: "keyword_soft_stuffing",
    });
  }

  if (scores.readability.pages > 2) {
    const tail = text.slice(Math.max(0, text.length - 80)).trim() || "(fin du CV)";
    push({
      kind: "length",
      axis: "readability",
      shortLabel: isEn ? "Length" : "Longueur",
      severity: "warning",
      textStart: Math.max(0, text.length - 80),
      textEnd: text.length,
      quote: tail,
      title: isEn
        ? `Shorten to 1–2 pages (now ~${scores.readability.pages})`
        : `Passer à 1–2 pages (actuellement ~${scores.readability.pages})`,
      detail: isEn
        ? "Cut older roles to title + 1 bullet; remove redundant soft skills lists."
        : "Réduisez les postes anciens à intitulé + 1 puce ; retirez les listes de soft skills redondantes.",
      suggestion: isEn
        ? "Keep 1–2 pages: recent roles with metrics; older roles → title + dates only."
        : "Gardez 1–2 pages : rôles récents avec chiffres ; postes anciens → intitulé + dates seuls.",
      applyMode: "replace",
      approximate: true,
      checkId: "page_length",
    });
  }

  if (!(parsed?.contact?.linkedin || detectLinkedIn(text))) {
    push({
      kind: "missing_linkedin",
      axis: "structure",
      shortLabel: "LinkedIn",
      severity: "info",
      textStart: 0,
      textEnd: Math.min(50, text.length),
      quote: text.slice(0, Math.min(50, text.length)).trim(),
      title: isEn ? "Add your LinkedIn URL" : "Ajouter votre URL LinkedIn",
      detail: isEn
        ? "Use a full linkedin.com/in/… URL (the word “LinkedIn” alone is not enough)."
        : "Indiquez une URL linkedin.com/in/… complète (le mot « LinkedIn » seul ne suffit pas).",
      suggestion: "[linkedin.com/in/votre-profil]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "linkedin",
    });
  }

  if (scores.readability.hasTables) {
    const alsoCols = scores.readability.hasColumnsSmell;
    push({
      kind: "no_tables",
      axis: "readability",
      shortLabel: isEn ? "Tables" : "Tableaux",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(30, text.length),
      quote: text.slice(0, Math.min(30, text.length)).trim() || "(document)",
      title: isEn
        ? "Tables confuse ATS parsers"
        : "Tableaux illisibles pour les ATS",
      detail: isEn
        ? alsoCols
          ? "We detected table grids and column signals. ATS often read cells out of order. Rebuild as a single-column linear layout (no tables) in your original file."
          : "Table grids scramble cell order in many ATS. Convert tables to plain paragraphs or bullet lists in a single column."
        : alsoCols
          ? "Grilles de tableaux et indices de colonnes détectés. Les ATS mélangent souvent l’ordre des cellules. Refaites une mise en page linéaire mono-colonne (sans tableaux) dans votre fichier d’origine."
          : "Les grilles de tableaux brouillent l’ordre des cellules dans beaucoup d’ATS. Convertissez les tableaux en paragraphes ou listes à puces, en une seule colonne.",
      suggestion: isEn
        ? "Word: Table → Convert to Text. Docs: copy cells into a bullet list. One column only."
        : "Word : Tableau → Convertir en texte. Docs : collez les cellules en liste à puces. Une seule colonne.",
      applyMode: "replace",
      approximate: true,
      checkId: "no_tables",
    });
  } else if (scores.readability.hasColumnsSmell) {
    push({
      kind: "single_column",
      axis: "readability",
      shortLabel: isEn ? "Columns" : "Colonnes",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(30, text.length),
      quote: text.slice(0, Math.min(30, text.length)).trim() || "(document)",
      title: isEn
        ? "Multi-column layout may confuse ATS"
        : "Colonnes risquées pour les ATS",
      detail: isEn
        ? "Two-column or sidebar layouts often reverse reading order for ATS. Prefer one continuous column: contact → experience → education → skills."
        : "Les mises en page à deux colonnes ou barre latérale inversent souvent l’ordre de lecture ATS. Préférez une seule colonne continue : contact → expérience → formation → compétences.",
      suggestion: isEn
        ? "Rebuild as one column: Contact → Experience → Education → Skills (no sidebar)."
        : "Refaire en une colonne : Contact → Expérience → Formation → Compétences (sans barre latérale).",
      applyMode: "replace",
      approximate: true,
      checkId: "single_column",
    });
  }

  if (scores.readability.imageOnly || (scores.readability.imageOnlyPages || []).length > 0) {
    const pages = scores.readability.imageOnlyPages || [];
    const pageHint = pages.length
      ? isEn
        ? ` (pages ${pages.join(", ")})`
        : ` (pages ${pages.join(", ")})`
      : "";
    push({
      kind: "image_scan",
      axis: "readability",
      shortLabel: isEn ? "Scan" : "Scan",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(document)",
      title: isEn
        ? `Image/scanned page — little extractable text${pageHint}`
        : `Page image/scan — peu de texte extractible${pageHint}`,
      detail: isEn
        ? "ATS cannot read text locked in images. Export a text PDF or DOCX from Word/Google Docs (File → Export), not a photo or flattened Canva export."
        : "Les ATS ne lisent pas le texte figé dans des images. Exportez un PDF texte ou un DOCX depuis Word/Google Docs (Fichier → Exporter), pas une photo ni un export Canva aplati.",
      suggestion: isEn
        ? "Re-export: Word/Docs → Download as PDF (text selectable) or .docx — not a scan/photo."
        : "Réexporterz : Word/Docs → Télécharger en PDF (texte sélectionnable) ou .docx — pas un scan/photo.",
      applyMode: "replace",
      approximate: true,
      checkId: "extractable_text",
    });
  }

  if (scores.readability.readingOrderOk === false) {
    push({
      kind: "reading_order",
      axis: "readability",
      shortLabel: isEn ? "Order" : "Ordre",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(30, text.length),
      quote: text.slice(0, Math.min(30, text.length)).trim() || "(document)",
      title: isEn
        ? "Inconsistent reading order (columns/sidebar)"
        : "Ordre de lecture incohérent (colonnes/sidebar)",
      detail: isEn
        ? "Extraction order diverges from visual order — ATS may scramble sections."
        : "L'ordre d'extraction diverge de l'ordre visuel — un ATS peut mélanger les sections.",
      suggestion: isEn
        ? "Use a single-column Word/Docs layout so visual order = ATS reading order."
        : "Passez en mise en page Word/Docs mono-colonne pour aligner ordre visuel et lecture ATS.",
      applyMode: "replace",
      approximate: true,
      checkId: "reading_order",
    });
  }

  if (parsed?.layout?.headerSparse || scores.readability.headerSparse) {
    push({
      kind: "header_sparse",
      axis: "readability",
      shortLabel: isEn ? "Header" : "En-tête",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(début)",
      title: isEn
        ? "Contact likely in a graphic header"
        : "Contact probablement dans une en-tête graphique",
      detail: isEn
        ? "Very little plain text in the top band while the body is rich — contact is likely drawn as an image. Put your full name, email and phone as selectable text at the top (not in a banner graphic)."
        : "Peu de texte extractible en haut de page alors que le corps est riche — le contact est probablement dans une image/bandeau. Placez prénom, nom, e-mail et téléphone en texte sélectionnable en tête (pas dans un bandeau graphique).",
      suggestion: isEn
        ? "[First Last] · [you@email.com] · [+33 6 XX XX XX XX]"
        : "[Prénom Nom] · [votre.email@domaine.fr] · [06 XX XX XX XX]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "contact_plaintext",
    });
  }

  if (parsed?.graphicSkills) {
    const sk = sectionAnchor(text, "skills", parsed) || {
      textStart: Math.max(0, text.length - 1),
      textEnd: text.length,
      quote: "(compétences)",
    };
    push({
      kind: "graphic_skills",
      axis: "readability",
      shortLabel: isEn ? "Skills" : "Compétences",
      severity: "warning",
      ...sk,
      title: isEn
        ? "Skills shown as graphics (ATS-blind)"
        : "Compétences en graphiques illisibles ATS",
      detail: isEn
        ? "Stars, bars or level gauges are not read as keywords. Delete the graphics and list skill names in plain text (comma-separated or bullets)."
        : "Étoiles, barres ou jauges de niveau ne sont pas lues comme mots-clés. Supprimez les graphiques et listez les compétences en texte clair (séparées par des virgules ou en puces).",
      suggestion: isEn
        ? "Skills: [tool], [method], [domain]"
        : "Compétences : [outil], [méthode], [domaine]",
      applyMode: "insert_after",
      section: "Compétences",
      approximate: !sk.quote || sk.quote === "(compétences)",
      checkId: "graphic_skills",
    });
  }

  const hasStrictName = Boolean(parsed?.contact?.firstName && parsed?.contact?.lastName);
  if (!hasStrictName) {
    push({
      kind: "missing_name",
      axis: "structure",
      shortLabel: isEn ? "Name" : "Nom",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: (parsed?.contact?.name || text.slice(0, Math.min(40, text.length))).trim(),
      title: isEn ? "Add your full name (first + last) in plain text" : "Ajouter prénom et nom en texte clair",
      detail: isEn
        ? "ATS need a clear first and last name at the top (not a job title or logo)."
        : "Les ATS ont besoin d'un prénom + nom clairs en tête (pas un intitulé de poste ni un logo).",
      suggestion: "[Prénom Nom]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "identity_name",
    });
  }

  if (!parsed?.contact?.location && !parsed?.contact?.address) {
    push({
      kind: "missing_location",
      axis: "structure",
      shortLabel: isEn ? "Location" : "Adresse",
      severity: "info",
      textStart: 0,
      textEnd: Math.min(50, text.length),
      quote: text.slice(0, Math.min(50, text.length)).trim(),
      title: isEn ? "Add a city or address in plain text" : "Ajouter une ville ou une adresse en texte",
      detail: isEn
        ? "Location helps ATS location filters. Prefer City or ZIP + City (street optional)."
        : "La localisation aide les filtres ATS. Indiquez Ville ou CP + Ville (rue optionnelle).",
      suggestion: isEn ? "City, Country" : "75001 Paris",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "identity_address",
    });
  }

  if (parsed?.layout?.profilePhotoHint || parsed?.layout?.photoKind === "face") {
    const soft = parsed?.layout?.photoKind === "logo" || parsed?.layout?.photoKind === "other";
    if (!soft) {
      push({
        kind: "profile_photo",
        axis: "readability",
        shortLabel: isEn ? "Photo" : "Photo",
        severity: "warning",
        textStart: 0,
        textEnd: Math.min(30, text.length),
        quote: text.slice(0, Math.min(30, text.length)).trim() || "(en-tête)",
        title: isEn
          ? "Profile photo may hurt ATS parsing"
          : "Photo de profil risquée pour les ATS",
        detail: isEn
          ? "A profile photo in the header is often ignored or scrambles reading order. Remove the photo for ATS applications and keep name, email and phone as plain text only."
          : "Une photo de profil en en-tête est souvent ignorée ou brouille l'ordre de lecture. Retirez la photo pour les candidatures ATS et gardez nom, e-mail et téléphone en texte clair uniquement.",
        suggestion: isEn
          ? "Remove the photo; keep « First Last · email · phone » as selectable text at the top."
          : "Retirez la photo ; gardez « Prénom Nom · e-mail · téléphone » en texte sélectionnable en tête.",
        applyMode: "replace",
        approximate: true,
        checkId: "profile_photo",
      });
    }
  }

  const headline = (parsed?.headline || "").trim();
  const hasRoles = (parsed?.roles || []).length > 0;
  const nameNorm = (parsed?.contact?.name || "").trim().toLowerCase();
  const headlineIsName = headline && nameNorm && headline.toLowerCase() === nameNorm;
  if (hasRoles && (!headline || headlineIsName)) {
    push({
      kind: "missing_headline",
      axis: "structure",
      shortLabel: isEn ? "Title" : "Titre",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: (parsed?.contact?.name || text.slice(0, 40)).trim(),
      title: isEn ? "Add a clear job title under your name" : "Ajouter un intitulé de poste sous votre nom",
      detail: isEn
        ? "A headline job title helps ATS and recruiters map your target role."
        : "Un intitulé sous le nom aide les ATS et recruteurs à cibler votre poste.",
      suggestion: isEn ? "[Target job title]" : "[Intitulé de poste ciblé]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "job_title_headline",
    });
  }

  let missingDateAnns = 0;
  for (const role of parsed?.roles || []) {
    if (missingDateAnns >= 3) break;
    if (role.startYear) continue;
    if (!isCredibleRoleForDates(role)) continue;
    const quote = (role.title || role.company || role.raw || "poste").slice(0, 80);
    const loc = locateQuote(text, quote) || {
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote,
    };
    push({
      kind: "missing_dates",
      axis: "structure",
      shortLabel: isEn ? "Dates" : "Dates",
      severity: "warning",
      ...loc,
      title: isEn
        ? `Add dates for « ${quote.slice(0, 40)} »`
        : `Ajouter des dates pour « ${quote.slice(0, 40)} »`,
      detail: isEn
        ? "Each role should include start–end years (or “present”) so ATS can map your timeline."
        : "Chaque poste doit avoir des années début–fin (ou « aujourd'hui ») pour cartographier le parcours.",
      suggestion: isEn
        ? `${role.title || "[Title]"} — ${role.company || "[Company]"} (YYYY – YYYY)`
        : `${role.title || "[Intitulé]"} — ${role.company || "[Entreprise]"} (AAAA – AAAA)`,
      applyMode: "insert_after",
      approximate: true,
      checkId: "role_dates",
    });
    missingDateAnns += 1;
  }

  const interests = parsed?.interests;
  if (interests?.status === "empty") {
    push({
      kind: "empty_interests",
      axis: "structure",
      shortLabel: isEn ? "Interests" : "Intérêts",
      severity: "warning",
      textStart: Math.max(0, text.length - 1),
      textEnd: text.length,
      quote: "(centres d'intérêt)",
      title: isEn ? "Fill the Interests section" : "Compléter la section Centres d'intérêt",
      detail: isEn
        ? "The heading exists but has no items. Add 3–5 concrete interests or remove the section."
        : "Le titre est là mais sans contenu. Ajoutez 3–5 intérêts concrets ou retirez la section.",
      suggestion: isEn
        ? "Interests: [hobby linked to your role], [sport], [community]"
        : "Centres d'intérêt : [activité liée au poste], [sport], [engagement]",
      applyMode: "insert_after",
      approximate: true,
      checkId: "interests",
    });
  } else if (interests?.status === "generic") {
    push({
      kind: "generic_interests",
      axis: "structure",
      shortLabel: isEn ? "Interests" : "Intérêts",
      severity: "info",
      textStart: Math.max(0, text.length - 1),
      textEnd: text.length,
      quote: (interests.lines || []).slice(0, 3).join(", ") || "(intérêts)",
      title: isEn
        ? "Make interests more specific (3–5 items)"
        : "Cibler 3–5 centres d'intérêt parlants",
      detail: isEn
        ? "Generic lists (cinema, sport, travel) add little signal. Prefer concrete, discussable interests."
        : "Les listes génériques (cinéma, sport, voyage) apportent peu. Préférez des intérêts concrets et discutables.",
      suggestion: isEn
        ? "Interests: [specific project / sport / community]"
        : "Centres d'intérêt : [projet / sport / engagement précis]",
      applyMode: "insert_after",
      approximate: true,
      checkId: "interests",
    });
  }

  const completeRole = (parsed?.roles || []).some(
    (r) => r.title && r.company && r.startYear
  );
  if ((parsed?.roles?.length || 0) > 0 && !completeRole && hasParsedSection(parsed, "experience")) {
    const exp = sectionAnchor(text, "experience", parsed) || {
      textStart: 0,
      textEnd: 20,
      quote: "EXPÉRIENCE",
    };
    push({
      kind: "incomplete_role",
      axis: "structure",
      shortLabel: isEn ? "Role" : "Poste",
      severity: "warning",
      ...exp,
      title: isEn
        ? "Complete at least one role (title + company + dates)"
        : "Compléter au moins un poste (intitulé + entreprise + dates)",
      detail: isEn
        ? "No role was fully parsed with title, company and dates — ATS struggle to map your career."
        : "Aucun poste n'a été entièrement parsé (intitulé, entreprise, dates) — les ATS peinent à cartographier le parcours.",
      suggestion: isEn
        ? "Job title — Company (YYYY – YYYY)"
        : "Intitulé — Entreprise (AAAA – AAAA)",
      applyMode: "insert_after",
      approximate: true,
      checkId: "complete_role",
    });
  }

  // Section ordering: Education before Experience for experienced candidates
  const expAnchor = sectionAnchor(text, "experience", parsed);
  const eduAnchor = sectionAnchor(text, "education", parsed);
  const rolesCount = (parsed?.roles || []).filter((r) => r.section !== "education").length;
  if (expAnchor && eduAnchor && rolesCount >= 3 && eduAnchor.textStart < expAnchor.textStart) {
    push({
      kind: "section_order",
      axis: "structure",
      shortLabel: isEn ? "Order" : "Ordre",
      severity: "info",
      textStart: eduAnchor.textStart,
      textEnd: eduAnchor.textEnd,
      quote: eduAnchor.quote,
      title: isEn
        ? "Put Experience before Education"
        : "Placer Expérience avant Formation",
      detail: isEn
        ? "With 3+ roles, recruiters and ATS expect Experience first — move Education after."
        : "Avec 3+ postes, les recruteurs et ATS s'attendent à voir l'Expérience en premier — déplacez la Formation après.",
      suggestion: isEn
        ? "Move the Education block below Experience."
        : "Déplacez le bloc Formation sous Expérience.",
      applyMode: "replace",
      approximate: true,
      checkId: "section_order",
    });
  }

  // Overlapping dates
  const dateOverlaps = findOverlappingDates(parsed?.roles);
  if (dateOverlaps.length > 0) {
    const first = dateOverlaps[0];
    const exp2 = sectionAnchor(text, "experience", parsed) || { textStart: 0, textEnd: 30, quote: "(expérience)" };
    push({
      kind: "overlapping_dates",
      axis: "structure",
      shortLabel: isEn ? "Dates" : "Dates",
      severity: "warning",
      textStart: exp2.textStart,
      textEnd: exp2.textEnd,
      quote: exp2.quote,
      title: isEn
        ? `Overlapping dates (${first.overlapYears}y between roles)`
        : `Dates qui se chevauchent (${first.overlapYears} an(s) entre postes)`,
      detail: isEn
        ? "Some roles have overlapping date ranges — ATS may flag inconsistency."
        : "Certains postes ont des plages de dates qui se chevauchent — un ATS peut signaler une incohérence.",
      suggestion: isEn
        ? "Job title — Company (YYYY – YYYY) — adjust end/start so ranges do not overlap unless concurrent."
        : "Intitulé — Entreprise (AAAA – AAAA) — ajustez fin/début pour éviter le chevauchement sauf cumul.",
      applyMode: "replace",
      approximate: true,
      checkId: "overlapping_dates",
    });
  }

  // Reverse chronology
  if (!isReverseChronological(parsed?.roles) && (parsed?.roles || []).length >= 2) {
    const exp3 = sectionAnchor(text, "experience", parsed) || { textStart: 0, textEnd: 30, quote: "(expérience)" };
    push({
      kind: "reverse_chronology",
      axis: "structure",
      shortLabel: isEn ? "Chrono" : "Chrono",
      severity: "info",
      textStart: exp3.textStart,
      textEnd: exp3.textEnd,
      quote: exp3.quote,
      title: isEn
        ? "List roles in reverse chronological order"
        : "Classez les postes du plus récent au plus ancien",
      detail: isEn
        ? "ATS and recruiters expect the most recent role first."
        : "Les ATS et recruteurs s'attendent à voir le poste le plus récent en premier.",
      suggestion: isEn
        ? "Reorder roles: most recent employer first, then older roles."
        : "Réordonnez : employeur le plus récent en premier, puis les postes plus anciens.",
      applyMode: "replace",
      approximate: true,
      checkId: "reverse_chronology",
    });
  }

  // Bridge: standard_headings KO (even if per-section anns exist)
  const headingsKo =
    scores.readability?.standardHeadings === false ||
    (scores.structure?.checks || []).some((c) => c.id === "standard_headings" && c.ok === false) ||
    (scores.readability?.checks || []).some((c) => c.id === "standard_headings" && c.ok === false);
  if (headingsKo && !annotations.some((a) => a.checkId === "standard_headings")) {
    const hasExp = hasParsedSection(parsed, "experience");
    const hasEdu = hasParsedSection(parsed, "education");
    const hasSkills = hasParsedSection(parsed, "skills");
    const missing = [
      !hasExp ? (isEn ? "Experience" : "Expérience") : null,
      !hasEdu ? (isEn ? "Education" : "Formation") : null,
      !hasSkills ? (isEn ? "Skills" : "Compétences") : null,
    ].filter(Boolean);
    push({
      kind: "missing_section",
      axis: "readability",
      shortLabel: isEn ? "Headings" : "Titres",
      severity: "critical",
      textStart: Math.max(0, text.length - 1),
      textEnd: text.length,
      quote: "(fin du document)",
      title: isEn
        ? `Add ATS-standard headings (${missing.join(" / ") || "Experience / Education / Skills"})`
        : `Ajouter des titres ATS standards (${missing.join(" / ") || "Expérience / Formation / Compétences"})`,
      detail: isEn
        ? "ATS look for clear Experience / Education / Skills section titles. Rename creative headings to these labels."
        : "Les ATS cherchent des titres clairs Expérience / Formation / Compétences. Renommez les intitulés créatifs avec ces libellés.",
      suggestion: isEn
        ? "EXPERIENCE\nEDUCATION\nSKILLS"
        : "EXPÉRIENCE PROFESSIONNELLE\nFORMATION\nCOMPÉTENCES",
      applyMode: "insert_after",
      approximate: true,
      checkId: "standard_headings",
    });
  }

  // Bridge: encoding KO
  const encodingKo = (scores.readability?.checks || []).some((c) => c.id === "encoding" && c.ok === false);
  if (encodingKo && !annotations.some((a) => a.checkId === "encoding")) {
    push({
      kind: "encoding",
      axis: "readability",
      shortLabel: isEn ? "Encoding" : "Encodage",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(document)",
      title: isEn
        ? "Unreadable characters (encoding / OCR)"
        : "Caractères illisibles (encodage / OCR)",
      detail: isEn
        ? "Strange symbols often come from a bad export or scan OCR. Re-export as UTF-8 text PDF or DOCX from Word/Docs."
        : "Des symboles bizarres viennent souvent d'un mauvais export ou d'un OCR de scan. Réexportez en PDF texte UTF-8 ou DOCX depuis Word/Docs.",
      suggestion: isEn
        ? "Re-save from Word/Google Docs as PDF (text) or .docx — avoid scanned image PDFs."
        : "Réenregistrez depuis Word/Google Docs en PDF (texte) ou .docx — évitez les PDF image/scan.",
      applyMode: "replace",
      approximate: true,
      checkId: "encoding",
    });
  }

  // Bridge: job_title KO
  const jobTitleKo = (scores.structure?.checks || []).some((c) => c.id === "job_title" && c.ok === false);
  if (jobTitleKo && !annotations.some((a) => a.checkId === "job_title" || a.checkId === "job_title_headline")) {
    push({
      kind: "missing_headline",
      axis: "structure",
      shortLabel: isEn ? "Title" : "Titre",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: (parsed?.contact?.name || text.slice(0, 40)).trim(),
      title: isEn ? "Add a clear job title under your name" : "Ajouter un intitulé de poste sous votre nom",
      detail: isEn
        ? "No parsed headline or role title at the top — ATS need a clear target job title."
        : "Aucun intitulé (headline) ni titre de poste parsé en tête — les ATS ont besoin d'un poste cible clair.",
      suggestion: isEn ? "[Target job title]" : "[Intitulé de poste ciblé]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
      checkId: "job_title",
    });
  }

  return annotations
    .map((a) => {
      const q = String(a.quote || "").trim();
      if (q && !/^\([^)]*\)$/.test(q)) return a;
      const fromOffsets =
        a.textStart != null && a.textEnd != null
          ? text.slice(a.textStart, a.textEnd).replace(/\s+/g, " ").trim()
          : "";
      const fallback = fromOffsets || text.slice(0, 80).replace(/\s+/g, " ").trim();
      if (!fallback) return null;
      return {
        ...a,
        quote: fallback.slice(0, 140),
        approximate: true,
      };
    })
    .filter(Boolean);
}

/**
 * Skip phantom "roles" that are actually duty/tool lines (false missing_dates).
 * @param {object} role
 */
function isCredibleRoleForDates(role) {
  if (!role) return false;
  const title = String(role.title || "").trim();
  const company = String(role.company || "").trim();
  const raw = String(role.raw || "").trim();
  const blob = title || raw;
  if (!blob && !company) return false;
  // Tool / reporting mission lines
  if (/[;|]/.test(blob) && blob.length >= 20) return false;
  if (
    /\b(ATS|SIRH|Excel|PowerPoint|CRM|ERP|KPI|reporting|reportings?|pipeline)\b/i.test(blob) &&
    blob.length >= 18 &&
    !company
  ) {
    return false;
  }
  // Long prose without company → not a poste
  if (!company && blob.length >= 45 && !/—|–/.test(blob)) return false;
  // Need at least a title-like or company signal
  if (!title && !company) return false;
  if (title && !company && /[.!?]$/.test(title)) return false;
  return true;
}

function shortLabelFor(kind) {
  const map = {
    typo: "Orthographe",
    grammar: "Grammaire",
    missing_email: "Email",
    missing_phone: "Téléphone",
    missing_linkedin: "LinkedIn",
    missing_section: "Section",
    missing_name: "Nom",
    missing_location: "Adresse",
    missing_headline: "Titre",
    missing_dates: "Dates",
    empty_interests: "Intérêts",
    generic_interests: "Intérêts",
    profile_photo: "Photo",
    incomplete_role: "Poste",
    passive_verb: "Verbe",
    missing_metric: "Chiffre",
    gap: "Gap",
    keyword: "Mots-clés",
    jd_must: "Must",
    role_keywords: "Pack métier",
    length: "Longueur",
    layout: "Mise en page",
    no_tables: "Tableaux",
    single_column: "Colonnes",
    image_scan: "Scan",
    cv_source: "Source",
    reading_order: "Ordre",
    header_sparse: "En-tête",
    graphic_skills: "Compétences",
  };
  return map[kind] || "Correction";
}

function guessSection(text, offset) {
  const head = text.slice(0, offset + 1);
  const markers = [
    { re: SECTION_PATTERNS.experience, label: "Expérience" },
    { re: SECTION_PATTERNS.education, label: "Formation" },
    { re: SECTION_PATTERNS.skills, label: "Compétences" },
    { re: SECTION_PATTERNS.languages, label: "Langues" },
    { re: SECTION_PATTERNS.summary, label: "Profil" },
  ];
  let best = "Document";
  let bestIdx = -1;
  for (const m of markers) {
    m.re.lastIndex = 0;
    let match;
    const copy = new RegExp(m.re.source, "gi");
    while ((match = copy.exec(head)) !== null) {
      if (match.index >= bestIdx) {
        bestIdx = match.index;
        best = m.label;
      }
    }
  }
  return best;
}

/**
 * Enrichit les annotations avec rects PDF depuis pagesGeo.
 * @param {object[]} annotations
 * @param {import('./extract.js').PageGeo[]|undefined} pagesGeo
 * @param {typeof import('./extract.js')} extractApi
 */
export function attachGeometry(annotations, pagesGeo, extractApi) {
  if (!annotations?.length) return annotations || [];
  const {
    rectsForRange,
    headerBannerRects,
    footerAnchorRects,
  } = extractApi || {};

  return annotations.map((ann) => {
    let page = ann.page || 1;
    let rects = [];
    let approximate = ann.approximate !== false;
    let placement = "exact";

    if (pagesGeo?.length && rectsForRange && ann.textStart != null && ann.textEnd != null) {
      const hit = rectsForRange(pagesGeo, ann.textStart, ann.textEnd);
      if (hit.rects.length) {
        page = hit.page;
        rects = hit.rects;
        approximate = false;
        placement = "exact";
      }
    }

    if (!rects.length) {
      if (ann.applyMode === "insert_header" && headerBannerRects) {
        rects = headerBannerRects();
        page = 1;
        placement = "insert";
      } else if ((ann.applyMode === "insert_after" || ann.kind === "missing_section") && footerAnchorRects) {
        rects = footerAnchorRects();
        page = pagesGeo?.length || 1;
        placement = "insert";
      } else {
        // bandeau approximatif autour de l'offset relatif
        const y =
          ann.textStart != null
            ? Math.min(0.85, 0.08 + Number(ann.textStart) * 0.00015)
            : 0.3;
        rects = [{ x: 0.06, y, w: 0.88, h: 0.045 }];
        placement = "approx";
      }
      approximate = true;
    }

    return { ...ann, page, rects, approximate, placement };
  });
}

function scoreReadability(text, fileMeta) {
  const checks = [];
  let score = 0;
  const len = text.replace(/\s/g, "").length;
  const layout = fileMeta.parsed?.layout;
  const profile = detectDocumentProfile(fileMeta, layout, text);
  const extractable = profile.extractability === "text" || profile.extractability === "sparse";
  if (profile.extractability === "text") {
    score += 10;
    checks.push({
      id: "extractable_text",
      ok: true,
      label: "Texte correctement extractible par les ATS.",
    });
  } else if (profile.extractability === "sparse") {
    score += 6;
    checks.push({
      id: "extractable_text",
      ok: false,
      label: "Texte extractible mais sparse — complétez le contenu ou vérifiez l'export.",
    });
  } else if (profile.extractability === "scan_like") {
    checks.push({
      id: "extractable_text",
      ok: false,
      label:
        profile.imageOnlyPages.length > 0
          ? `Page(s) quasi image/scan détectée(s) : ${profile.imageOnlyPages.join(", ")}.`
          : "Texte difficilement extractible — le CV semble scanné ou en image.",
    });
  } else {
    checks.push({
      id: "extractable_text",
      ok: false,
      label:
        profile.weirdChars >= 10
          ? "Caractères illisibles détectés (encodage ou OCR défaillant)."
          : "Texte difficilement extractible — le CV semble scanné ou en image.",
    });
  }

  const pages = estimatePages(text, fileMeta);
  if (pages <= 2) {
    score += 8;
    checks.push({
      id: "page_length",
      ok: true,
      label: pages === 1 ? "Longueur idéale (1 page)." : `Longueur acceptable (${pages} pages).`,
    });
  } else if (pages === 3) {
    score += 4;
    checks.push({
      id: "page_length",
      ok: false,
      label: "CV un peu long (3 pages) — visez 1 à 2 pages.",
    });
  } else {
    checks.push({
      id: "page_length",
      ok: false,
      label: `CV trop long (${pages} pages) — risque de rejet ATS/RH.`,
    });
  }

  const weirdChars = profile.weirdChars;
  const hasColumnsSmell = profile.layoutFlags.hasColumnsSmell;
  const hasTables = profile.layoutFlags.hasTables;
  const headerSparse = profile.layoutFlags.headerSparse;
  const readingOrderOk = profile.layoutFlags.readingOrderOk;
  const imageOnlyPages = profile.imageOnlyPages;
  const imageOnly = profile.extractability === "scan_like";

  if (imageOnlyPages.length > 0) {
    score = Math.max(0, score - 4);
  } else if (imageOnly) {
    score = Math.max(0, score - 3);
  }

  if (weirdChars === 0 && !hasColumnsSmell && !hasTables && readingOrderOk) {
    score += 7;
    checks.push({
      id: "single_column",
      ok: true,
      label: "Mise en page linéaire, favorable aux ATS.",
    });
    checks.push({ id: "no_tables", ok: true, label: "Pas de tableaux détectés." });
  } else if (weirdChars > 0) {
    score += 2;
    checks.push({
      id: "encoding",
      ok: false,
      label: "Caractères illisibles détectés (encodage ou OCR défaillant).",
    });
    checks.push({
      id: "single_column",
      ok: !hasColumnsSmell,
      label: hasColumnsSmell
        ? "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte."
        : "Mise en page linéaire, favorable aux ATS.",
    });
    checks.push({
      id: "no_tables",
      ok: !hasTables,
      label: hasTables
        ? "Tableaux détectés — certains ATS mélangent l'ordre des cellules."
        : "Pas de tableaux détectés.",
    });
  } else if (hasTables) {
    score += 3;
    checks.push({
      id: "no_tables",
      ok: false,
      label: "Tableaux détectés — certains ATS mélangent l'ordre des cellules.",
    });
    checks.push({
      id: "single_column",
      ok: !hasColumnsSmell,
      label: hasColumnsSmell
        ? "Indices de colonnes — certains ATS mélangent l'ordre du texte."
        : "Mise en page mono-colonne.",
    });
  } else if (!readingOrderOk) {
    score += 3;
    checks.push({
      id: "reading_order",
      ok: false,
      label: "Ordre de lecture incohérent (colonnes/sidebar) — risque de mélange ATS.",
    });
    checks.push({ id: "no_tables", ok: true, label: "Pas de tableaux détectés." });
    checks.push({
      id: "single_column",
      ok: false,
      label: "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte.",
    });
  } else {
    score += 3;
    checks.push({
      id: "single_column",
      ok: false,
      label: "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte.",
    });
    checks.push({ id: "no_tables", ok: true, label: "Pas de tableaux détectés." });
  }

  if (readingOrderOk && !checks.some((c) => c.id === "reading_order")) {
    checks.push({
      id: "reading_order",
      ok: true,
      label: "Ordre de lecture cohérent.",
    });
  }

  if (headerSparse) {
    score = Math.max(0, score - 2);
    checks.push({
      id: "contact_plaintext",
      ok: false,
      label: "Bandeau haut peu textuel — contact probablement dans une image/en-tête graphique.",
    });
  }

  if (fileMeta.parsed?.graphicSkills) {
    score = Math.max(0, score - 1);
    checks.push({
      id: "graphic_skills",
      ok: false,
      label: "Compétences représentées en graphiques (étoiles/barres) — illisibles pour les ATS.",
    });
  }

  const profilePhotoHint = !!(layout?.profilePhotoHint || fileMeta.profilePhotoHint);
  const photoKind =
    fileMeta.photoClassify?.kind || fileMeta.parsed?.layout?.photoKind || null;
  if (photoKind === "logo" || photoKind === "other") {
    checks.push({
      id: "profile_photo",
      ok: true,
      label:
        photoKind === "logo"
          ? "Image d’en-tête classée logo/décoratif (risque ATS faible)."
          : "Image d’en-tête classée décorative (risque ATS faible).",
    });
  } else if (profilePhotoHint || photoKind === "face") {
    score = Math.max(0, score - 1);
    checks.push({
      id: "profile_photo",
      ok: false,
      label: "Photo de profil détectée — souvent ignorée ou nuisible aux parseurs ATS ; préférez le texte.",
    });
  } else {
    checks.push({
      id: "profile_photo",
      ok: null,
      na: true,
      label: "Photo de profil : non applicable (aucune détectée).",
    });
  }

  // Colonnes = cap sévère (ATS réels échouent à parser les colonnes)
  if (hasColumnsSmell) {
    score = Math.min(score, 12);
  }

  // Exigeant: pas de lisibilité « parfaite » si headings ATS non parsables
  const parsed = fileMeta.parsed;
  const hasExp = hasParsedSection(parsed, "experience");
  const hasEdu = hasParsedSection(parsed, "education");
  const hasSkills = hasParsedSection(parsed, "skills");
  const standardHeadings = hasExp && hasEdu && hasSkills;
  if (!standardHeadings) {
    score = Math.max(0, score - 7);
    score = Math.min(score, 18);
    const missing = [
      !hasExp ? "Expérience" : null,
      !hasEdu ? "Formation" : null,
      !hasSkills ? "Compétences" : null,
    ]
      .filter(Boolean)
      .join("/");
    checks.push({
      id: "standard_headings",
      ok: false,
      label: `Titres de sections non lisibles par un ATS (${missing}).`,
    });
  } else {
    checks.push({
      id: "standard_headings",
      ok: true,
      label: "Titres de sections standards détectés.",
    });
  }

  // Apply labels from ats-layout-rules.json when available
  const rules = fileMeta.layoutRules?.rules;
  if (Array.isArray(rules)) {
    for (const rule of rules) {
      const existing = checks.find((c) => c.id === rule.id);
      if (existing && !existing.ok && rule.label_fr) {
        // Keep more specific missing-list label for standard_headings
        if (rule.id === "standard_headings" && !standardHeadings) continue;
        existing.label = rule.label_fr;
      }
    }
  }

  const cvSource = profile.origin;
  if (cvSource.hostile) {
    score = Math.max(0, score - 3);
    score = Math.min(score, 16);
    checks.push({
      id: "cv_source",
      ok: false,
      label: `CV probablement créé avec ${cvSource.label} — risque ATS et crédibilité.`,
    });
  } else if (cvSource.id === "word" || cvSource.id === "google_docs" || cvSource.id === "latex") {
    checks.push({
      id: "cv_source",
      ok: true,
      label: `Source favorable détectée (${cvSource.label}).`,
    });
  } else {
    checks.push({
      id: "cv_source",
      ok: null,
      na: true,
      label: "Source du fichier : non identifiée.",
    });
  }

  return {
    score: Math.min(25, score),
    checks,
    pages,
    hasColumnsSmell,
    hasTables,
    headerSparse,
    readingOrderOk,
    standardHeadings,
    imageOnlyPages,
    imageOnly,
    cvSource,
    documentProfile: profile,
  };
}

function scoreStructure(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const parsed = fileMeta.parsed;
  const contact = parsed?.contact;

  if (contact?.email || detectEmail(text)) {
    score += 4;
    checks.push({ id: "email", ok: true, label: "Adresse e-mail présente." });
  } else {
    checks.push({ id: "email", ok: false, label: "Aucune adresse e-mail détectée." });
  }

  if (contact?.phone || detectPhone(text)) {
    score += 3;
    checks.push({ id: "phone", ok: true, label: "Numéro de téléphone détecté." });
  } else {
    checks.push({ id: "phone", ok: false, label: "Téléphone manquant ou non reconnu." });
  }

  if (contact?.linkedin || detectLinkedIn(text)) {
    score += 2;
    checks.push({ id: "linkedin", ok: true, label: "Profil LinkedIn mentionné." });
  } else {
    checks.push({ id: "linkedin", ok: false, label: "Lien LinkedIn absent." });
  }

  if (contact?.email && contact?.phone) {
    checks.push({
      id: "contact_plaintext",
      ok: true,
      label: "Coordonnées en texte clair.",
    });
  } else if (!checks.some((c) => c.id === "contact_plaintext")) {
    checks.push({
      id: "contact_plaintext",
      ok: false,
      label: "Coordonnées absentes ou non textuelles.",
    });
  }

  const hasStrictName = Boolean(contact?.firstName && contact?.lastName);
  if (hasStrictName) {
    score += 2;
    checks.push({
      id: "identity_name",
      ok: true,
      label: "Prénom et nom clairement identifiés.",
    });
  } else {
    checks.push({
      id: "identity_name",
      ok: false,
      label: "Prénom/nom absents ou peu identifiables (évitez un intitulé de poste à la place).",
    });
  }

  const hasAddress = Boolean(contact?.location || contact?.address);
  const geo = contact?.geo || fileMeta.geo || null;
  if (hasAddress) {
    score += geo?.ok && geo.confidence >= 0.4 ? 2 : 1;
    checks.push({
      id: "identity_address",
      ok: true,
      label:
        geo?.ok && geo.confidence >= 0.4
          ? `Adresse/localisation confirmée (géocode ${Math.round(geo.confidence * 100)}%).`
          : "Adresse ou localisation détectée.",
    });
  } else {
    checks.push({
      id: "identity_address",
      ok: false,
      label: "Localisation absente (ville/adresse) — utile pour le filtrage ATS.",
    });
  }

  const hasHeadline = Boolean(parsed?.headline && parsed.headline.trim());
  const hasRoleTitle = Boolean(parsed?.roles?.[0]?.title && parsed.roles[0].title.length > 2);
  /* Points seulement si headline / rôle parsé — pas un match JOB_TITLE_HINTS libre dans le texte */
  if (hasHeadline || hasRoleTitle) {
    score += 3;
    checks.push({ id: "job_title", ok: true, label: "Titre/intitulé de poste présent." });
  } else {
    checks.push({
      id: "job_title",
      ok: false,
      label: "Intitulé de poste peu identifiable en tête de CV.",
    });
  }

  if (hasHeadline) {
    score += 1;
    checks.push({
      id: "job_title_headline",
      ok: true,
      label: "Intitulé (headline) sous le nom détecté.",
    });
  } else if ((parsed?.roles || []).length > 0) {
    checks.push({
      id: "job_title_headline",
      ok: false,
      label: "Pas d'intitulé clair sous le nom — ajoutez un titre de poste ciblé.",
    });
  } else {
    checks.push({
      id: "job_title_headline",
      ok: false,
      label: "Pas d'intitulé clair sous le nom — ajoutez un titre de poste ciblé.",
    });
  }

  const completeRole = (parsed?.roles || []).some((r) => r.title && r.company && r.startYear);
  if (completeRole) {
    score += 1;
    checks.push({
      id: "complete_role",
      ok: true,
      label: "Au moins un poste avec intitulé, entreprise et dates.",
    });
  } else if (hasParsedSection(parsed, "experience")) {
    checks.push({
      id: "complete_role",
      ok: false,
      label: "Aucun poste complet (intitulé + entreprise + dates) parsable.",
    });
  }

  const roles = parsed?.roles || [];
  const datedRoles = roles.filter((r) => r.startYear != null && (r.endYear != null || r.ongoing));
  if (roles.length === 0) {
    checks.push({
      id: "role_dates",
      ok: null,
      na: true,
      label: "Dates de postes : non applicable (aucun rôle détecté).",
    });
  } else if (datedRoles.length >= 1) {
    score += 1;
    checks.push({
      id: "role_dates",
      ok: true,
      label: `Dates présentes sur ${datedRoles.length}/${roles.length} poste(s).`,
    });
  } else {
    checks.push({
      id: "role_dates",
      ok: false,
      label: "Aucun poste avec dates début/fin (ou « en cours ») parsable.",
    });
  }

  const interests = parsed?.interests;
  if (!interests || interests.status === "absent") {
    checks.push({
      id: "interests",
      ok: null,
      na: true,
      label: "Centres d'intérêt : non applicable (section absente).",
    });
  } else if (interests.status === "empty") {
    checks.push({
      id: "interests",
      ok: false,
      label: "Section Centres d'intérêt vide — complétez ou retirez le titre.",
    });
  } else if (interests.status === "generic") {
    checks.push({
      id: "interests",
      ok: false,
      label: "Centres d'intérêt trop génériques — cibler 3–5 intérêts parlants.",
    });
  } else {
    score += 1;
    checks.push({
      id: "interests",
      ok: true,
      label: "Centres d'intérêt présents et exploitables.",
    });
  }

  const hasExp = hasParsedSection(parsed, "experience");
  if (hasExp) {
    score += 4;
    checks.push({
      id: "section_experience",
      ok: true,
      label: "Section Expérience clairement identifiée.",
    });
  } else {
    score = Math.max(0, score - 3);
    checks.push({ id: "section_experience", ok: false, label: "Section Expérience non détectée." });
  }

  const hasEdu = hasParsedSection(parsed, "education");
  if (hasEdu) {
    score += 2;
    checks.push({ id: "section_education", ok: true, label: "Section Formation présente." });
  } else {
    score = Math.max(0, score - 2);
    checks.push({
      id: "section_education",
      ok: false,
      label: "Section Formation absente ou mal intitulée.",
    });
  }

  const hasSkills = hasParsedSection(parsed, "skills");
  if (hasSkills) {
    score += 2;
    checks.push({ id: "section_skills", ok: true, label: "Section Compétences présente." });
  } else {
    score = Math.max(0, score - 2);
    checks.push({ id: "section_skills", ok: false, label: "Section Compétences manquante." });
  }

  const hasCerts = hasParsedSection(parsed, "certifications") ||
    SECTION_PATTERNS.certifications.test(text.slice(0, 3000));
  if (hasCerts) {
    score += 1;
    checks.push({ id: "section_certifications", ok: true, label: "Section Certifications présente." });
  }

  const overlaps = findOverlappingDates(parsed?.roles);
  if (overlaps.length > 0) {
    checks.push({
      id: "overlapping_dates",
      ok: false,
      label: `Dates de postes qui se chevauchent (${overlaps.length}) — vérifiez la chronologie.`,
    });
  }

  if (!isReverseChronological(parsed?.roles)) {
    checks.push({
      id: "reverse_chronology",
      ok: false,
      label: "Postes non classés du plus récent au plus ancien — les ATS attendent un ordre anti-chronologique.",
    });
  }

  const standardHeadings = hasExp && hasEdu && hasSkills;
  checks.push({
    id: "standard_headings",
    ok: standardHeadings,
    label: standardHeadings
      ? "Titres de sections standards détectés."
      : "Titres de sections non lisibles par un ATS (Expérience/Formation/Compétences).",
  });

  return {
    score: Math.min(25, score),
    checks,
    roleCount: parsed?.roles?.length || 0,
    employmentGaps: parsed?.employmentGaps || [],
    standardHeadings,
    hasExp,
  };
}

function scoreContent(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const words = text.split(/\s+/).filter(Boolean);
  const verbInfo = fileMeta.verbStats;
  /* Toujours compter via verbStats (async) ou boundaries \b — jamais .includes (faux + sur « unmanaged ») */
  let verbHits;
  let verbsVerified = true;
  if (verbInfo && typeof verbInfo.strong === "number") {
    verbHits = verbInfo.strong;
  } else {
    verbHits = countActionVerbsBounded(text);
  }
  const weakHits = verbInfo?.weak || 0;

  if (verbHits >= 6) {
    score += 9;
    checks.push({ id: "action_verbs", ok: true, label: `Verbes d'action bien utilisés (${verbHits}).` });
  } else if (verbHits >= 3) {
    score += 5;
    checks.push({
      id: "action_verbs",
      ok: false,
      label: `Peu de verbes d'action (${verbHits}) — renforcez l'impact.`,
    });
  } else if (!verbsVerified) {
    checks.push({
      id: "action_verbs",
      ok: null,
      na: true,
      label: "Verbes d'action : non vérifiés (lexique indisponible).",
    });
  } else {
    checks.push({
      id: "action_verbs",
      ok: false,
      label: "Verbes d'action quasi absents — reformulez en réalisations.",
    });
  }

  if (weakHits >= 4) {
    score = Math.max(0, score - 3);
    checks.push({
      id: "weak_verbs",
      ok: false,
      label: `Trop de formulations faibles (${weakHits}) — remplacez par des verbes d'action.`,
    });
  } else if (weakHits >= 3) {
    score = Math.max(0, score - 2);
    checks.push({
      id: "weak_verbs",
      ok: false,
      label: `Formulations faibles détectées (${weakHits}) — préférez des verbes d'action.`,
    });
  }

  const roles = fileMeta.parsed?.roles || [];
  /* Exigent: métriques sur les 2 rôles récents (≥ 50 % des puces) */
  const recentRoles = roles.slice(0, 2);
  let bullets = 0;
  let bulletsWithMetrics = 0;
  let bulletsWithAction = 0;
  const ACTION_LINE =
    /\b(pilot[ée]|dirig[ée]|d[ée]velopp[ée]|optimis[ée]|augment[ée]|r[ée]duit[e]?|lanc[ée]|cr[ée][ée]|mis en place|led|managed|developed|designed|created|launched|improved|optimized|increased|reduced|built|delivered|achieved)\b/i;
  if (recentRoles.length) {
    for (const r of recentRoles) {
      for (const b of r.bullets || []) {
        bullets += 1;
        if (bulletHasResultMetric(b)) bulletsWithMetrics += 1;
        if (ACTION_LINE.test(b)) bulletsWithAction += 1;
      }
    }
  }
  /* Hors rôles parsés : pas de full credit document-wide — metrics ne verdit pas */
  const metrics = countResultMetrics(text);
  const metricsRatio = bullets ? bulletsWithMetrics / bullets : 0;
  if (bullets >= 2) {
    if (metricsRatio >= 0.5) {
      score += 9;
      checks.push({
        id: "metrics",
        ok: true,
        label: `Résultats chiffrés présents (${bulletsWithMetrics}/${bullets} puces des 2 rôles récents, seuil 50 %).`,
      });
    } else if (metricsRatio >= 0.25) {
      score += 4;
      checks.push({
        id: "metrics",
        ok: false,
        label: `Métriques insuffisantes (${bulletsWithMetrics}/${bullets} sur 2 rôles récents — seuil 50 %).`,
      });
    } else {
      checks.push({
        id: "metrics",
        ok: false,
        label: "Presque aucun résultat chiffré sur les rôles récents — les ATS et RH valorisent les preuves.",
      });
    }
  } else {
    checks.push({
      id: "metrics",
      ok: false,
      label:
        metrics > 0
          ? "Chiffres hors puces d'expérience — ajoutez des métriques sur les rôles récents (seuil 50 %)."
          : "Presque aucun résultat chiffré sur les rôles récents — les ATS et RH valorisent les preuves.",
    });
  }

  /* Verbe d'action sans objet/métrique = pas de full credit (déjà scoré plus haut via verbHits) */
  if (bullets >= 2 && bulletsWithAction > 0) {
    const actionWithMetric = recentRoles
      .flatMap((r) => r.bullets || [])
      .filter((b) => ACTION_LINE.test(b) && bulletHasResultMetric(b)).length;
    const bareAction = Math.max(0, bulletsWithAction - actionWithMetric);
    if (bareAction >= 2 && metricsRatio < 0.5) {
      score = Math.max(0, score - 2);
      checks.push({
        id: "action_without_metric",
        ok: false,
        label: `${bareAction} verbe(s) d'action sans chiffre — créditez l'impact avec une métrique.`,
      });
    }
  }

  const wordCount = words.length;
  if (wordCount >= 200 && wordCount <= 1000) {
    score += 7;
    checks.push({ id: "concision", ok: true, label: `Concision correcte (~${wordCount} mots).` });
  } else if (wordCount < 200) {
    checks.push({ id: "concision", ok: false, label: `Contenu trop court (~${wordCount} mots).` });
  } else {
    checks.push({
      id: "concision",
      ok: false,
      label: `Contenu dense (~${wordCount} mots) — allégez.`,
    });
  }

  const spellingIssues = Array.isArray(fileMeta.spelling) ? fileMeta.spelling : [];
  const typoCount = spellingIssues.filter((s) => s.kind !== "grammar").length;
  const grammarCount = spellingIssues.filter((s) => s.kind === "grammar").length;
  const spellDeep = !!fileMeta.spellingDeep;
  const grammarDeep = !!fileMeta.grammarDeep;
  const detectedLang = fileMeta.lang || detectLanguage(text);
  const spellPenalty = Math.min(4, typoCount);
  if (spellPenalty > 0) {
    score = Math.max(0, score - spellPenalty);
  }
  if (typoCount > 0) {
    checks.push({
      id: "spelling_quality",
      ok: false,
      label: `Orthographe : ${typoCount} faute(s) fréquente(s) (−${spellPenalty} pt).`,
    });
  } else if (spellDeep) {
    checks.push({
      id: "spelling_quality",
      ok: true,
      label: "Orthographe : pas de faute fréquente détectée.",
    });
  } else {
    /* Mini-lexique local sans hit → non vérifié (pas de faux vert) */
    checks.push({
      id: "spelling_quality",
      ok: null,
      na: true,
      label: "Orthographe : non vérifiée en profondeur (lexique local).",
    });
  }

  if (grammarCount > 0) {
    score = Math.max(0, score - Math.min(2, grammarCount));
    checks.push({
      id: "grammar_quality",
      ok: false,
      label: `Grammaire : ${grammarCount} tournure(s) à corriger.`,
    });
  } else if (detectedLang === "en" && !grammarDeep) {
    checks.push({
      id: "grammar_quality",
      ok: null,
      na: true,
      label: "Grammar: not deeply verified (requires Extract / LanguageTool).",
    });
  } else if (grammarDeep) {
    checks.push({
      id: "grammar_quality",
      ok: true,
      label: "Grammaire : pas de tournure douteuse détectée.",
    });
  } else {
    checks.push({
      id: "grammar_quality",
      ok: null,
      na: true,
      label: "Grammaire : non vérifiée en profondeur (lexique local).",
    });
  }

  return {
    score: Math.min(25, score),
    checks,
    hasMetrics: metrics >= 2 || bulletsWithMetrics >= 2,
    weakHits,
    verbWeakHits: Array.isArray(verbInfo?.weakHits) ? verbInfo.weakHits : [],
  };
}

/** Compte les verbes d'action avec frontières Unicode (anti faux positifs sous-chaîne). */
function countActionVerbsBounded(text) {
  const lower = (text || "").toLowerCase();
  let count = 0;
  for (const v of ACTION_VERBS) {
    /* \b JS ignore les accents (é ≠ word char) — utiliser frontiers Unicode */
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}_])${escapeReg(v.toLowerCase())}(?![\\p{L}\\p{N}_])`,
      "giu"
    );
    const m = lower.match(re);
    if (m) count += m.length;
  }
  return count;
}

function scoreKeywords(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const skillsMatch = fileMeta.skillsMatch;
  const jd = fileMeta.jdOverlap;
  const roleGaps = fileMeta.roleKeywordGaps;

  // Prefer hard hits from skills section + recent experience when available
  let hardFound = [];
  const sectionHard = skillsMatch?.sectionHardHits;
  if (Array.isArray(sectionHard) && sectionHard.length) {
    hardFound = sectionHard.filter((k) => String(k).length >= 3 && !isSoftKeyword(k));
  } else if (skillsMatch?.hardHits?.length) {
    hardFound = skillsMatch.hardHits.filter((k) => String(k).length >= 3 && !isSoftKeyword(k));
  } else if (skillsMatch && Array.isArray(skillsMatch.hardHits)) {
    // Lexicon loaded but no hard hits — do not fall back to soft hits
    hardFound = [];
  } else if (skillsMatch?.hits?.length) {
    hardFound = skillsMatch.hits.filter((k) => String(k).length >= 3 && !isSoftKeyword(k));
  } else {
    const lower = text.toLowerCase();
    hardFound = HARD_FALLBACK_KEYWORDS.filter((k) => {
      if (k.length < 3) return false;
      const re = new RegExp(`\\b${escapeReg(k)}\\b`, "i");
      return re.test(lower);
    });
  }
  const unique = new Set(hardFound);
  const softCount = Array.isArray(skillsMatch?.softHits) ? skillsMatch.softHits.length : 0;

  if (unique.size >= 12) {
    score += 12;
    checks.push({
      id: "keyword_density",
      ok: true,
      label: `Mots-clés métier hard détectés (${unique.size}).`,
    });
  } else if (unique.size >= 6) {
    score += 6;
    checks.push({
      id: "keyword_density",
      ok: false,
      label: `Densité hard moyenne (${unique.size}) — ajoutez outils/méthodes concrets.`,
    });
  } else {
    checks.push({
      id: "keyword_density",
      ok: false,
      label: "Peu de mots-clés métier hard — alignez-vous sur les outils de votre cible.",
    });
  }

  // Soft-stuffing: many soft skills, few hard → ATS Boolean noise
  if (softCount >= 5 && unique.size < 4) {
    score = Math.max(0, score - 2);
    checks.push({
      id: "keyword_soft_stuffing",
      ok: false,
      label: `Sur-représentation soft (${softCount}) vs hard (${unique.size}) — privilégiez outils et méthodes.`,
    });
  }

  const diversity = unique.size;
  // Informative only — same signal as density; no extra points
  if (diversity >= 8) {
    checks.push({
      id: "keyword_diversity",
      ok: true,
      label: "Bonne diversité d'outils et méthodes.",
    });
  } else {
    checks.push({
      id: "keyword_diversity",
      ok: false,
      label: "Diversifiez les outils/méthodes (pas seulement des soft skills).",
    });
  }

  // Role pack gaps (only when confidence / margin OK — matcher already gates)
  if (roleGaps?.role && roleGaps.missing?.length) {
    checks.push({
      id: "role_keywords",
      ok: false,
      label: `Pack « ${roleGaps.role} » : ${roleGaps.missing.length} terme(s) hard manquant(s) (ex. ${roleGaps.missing.slice(0, 3).join(", ")}).`,
    });
    score = Math.max(0, score - Math.min(4, roleGaps.missing.length));
  } else if (roleGaps?.role) {
    score += 2;
    checks.push({
      id: "role_keywords",
      ok: true,
      label: `Pack « ${roleGaps.role} » bien couvert.`,
    });
  }

  if (jd && jd.score != null) {
    const mustMiss = Array.isArray(jd.mustMissing) ? jd.mustMissing : [];
    const mustCov = jd.mustCoverage != null ? jd.mustCoverage : jd.score;
    if (jd.score >= 50 && mustMiss.length <= 2) {
      score += 5;
      checks.push({
        id: "jd_overlap",
        ok: true,
        label: `Alignement offre ↔ CV : ${jd.score}% (must ${mustCov}%, ${jd.overlap?.length || 0} termes communs).`,
      });
    } else {
      score += 1;
      checks.push({
        id: "jd_overlap",
        ok: false,
        label: mustMiss.length
          ? `Faible alignement offre (${jd.score}%) — must absents : ${mustMiss.slice(0, 4).join(", ")}.`
          : `Faible alignement avec l'offre (${jd.score}%) — reprenez les termes clés.`,
      });
    }
  } else {
    // Cap without JD — cannot validate keyword alignment without an offer
    score = Math.min(score, 12);
  }

  return {
    score: Math.min(25, score),
    checks,
    keywords: [...unique].slice(0, 24),
    jdOverlap: jd || null,
    roleKeywordGaps: roleGaps || null,
    softHits: skillsMatch?.softHits || [],
  };
}

/**
 * Checklist ATS explicite dérivée des 4 axes.
 * @returns {{ id: string, axis: string, ok: boolean, label: string }[]}
 */
function buildChecklist(readability, structure, content, keywords) {
  const axes = [
    ["readability", readability],
    ["structure", structure],
    ["content", content],
    ["keywords", keywords],
  ];
  const out = [];
  const seen = new Set();
  for (const [axis, block] of axes) {
    for (const c of block.checks || []) {
      const id = c.id || `${axis}_${out.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        axis,
        ok: c.ok === null || c.na ? null : !!c.ok,
        ...(c.ok === null || c.na ? { na: true } : {}),
        label: c.label,
      });
    }
  }
  return out;
}

function buildTags(text, content, structure) {
  const tags = [];
  const years = detectDates(text);
  const span = years.length ? years[years.length - 1] - years[0] : 0;
  if (span <= 3 || years.length <= 2) tags.push("Junior");
  else if (span >= 10) tags.push("Senior");
  else tags.push("Confirmé");

  if (/\b(rh|ressources humaines|recrutement|talent)\b/i.test(text)) tags.push("RH");
  if (/\b(d[ée]veloppeur|developer|devops|software|informatique)\b/i.test(text)) tags.push("Tech");
  if (/\b(marketing|communication|brand)\b/i.test(text)) tags.push("Marketing");
  if (/\b(public|fonction publique|administration|collectivit[ée])\b/i.test(text)) tags.push("Secteur public");
  if (/\b(finance|comptable|audit|contr[ôo]le de gestion)\b/i.test(text)) tags.push("Finance");

  if (!content.hasMetrics) tags.push("Sans métriques");
  if (ACADEMIC_MARKERS.some((m) => text.toLowerCase().includes(m))) tags.push("Profil académique");
  if (!structure.checks.find((c) => c.label.includes("LinkedIn") && c.ok)) tags.push("Sans LinkedIn");

  return [...new Set(tags)].slice(0, 5);
}

function buildDiagnostics(text, scores) {
  const diagnostics = [];
  const checklist = buildChecklist(
    scores.readability || { checks: [] },
    scores.structure || { checks: [] },
    scores.content || { checks: [] },
    scores.keywords || { checks: [] }
  );
  const byId = Object.fromEntries(checklist.map((c) => [c.id, c]));

  /** Cartes 1:1 pour checks critiques KO — lien studio via checkId */
  const CRITICAL = [
    {
      id: "email",
      severity: "critical",
      title: "E-mail manquant",
      tip: "→ Placez votre e-mail en texte clair en tête de CV.",
    },
    {
      id: "phone",
      severity: "critical",
      title: "Téléphone manquant",
      tip: "→ Ajoutez un numéro joignable en texte (pas dans une image).",
    },
    {
      id: "identity_name",
      severity: "critical",
      title: "Nom candidat peu identifiable",
      tip: "→ Mettez Prénom Nom en texte en haut du document.",
    },
    {
      id: "standard_headings",
      severity: "critical",
      title: "Titres de sections non standards",
      tip: "→ Utilisez Expérience / Formation / Compétences (libellés ATS).",
    },
    {
      id: "metrics",
      severity: "warning",
      title: "Manque de résultats chiffrés",
      tip: "→ Ajoutez des métriques sur ≥ 50 % des puces des 2 rôles récents.",
    },
    {
      id: "keyword_density",
      severity: "warning",
      title: "Densité de mots-clés hard insuffisante",
      tip: "→ Listez outils et méthodes concrets (pas seulement des soft skills).",
    },
    {
      id: "role_keywords",
      severity: "warning",
      title: "Termes hard du pack métier manquants",
      tip: "→ Complétez la section Compétences avec les outils de votre cible.",
    },
  ];

  for (const crit of CRITICAL) {
    const check = byId[crit.id];
    if (check && check.ok === false) {
      diagnostics.push({
        severity: crit.severity,
        title: crit.title,
        body: check.label || crit.title,
        tip: crit.tip,
        checkId: crit.id,
      });
    }
  }

  // Prefer employment-only gaps from structured parse
  const empGaps = scores.structure?.employmentGaps || [];
  if (empGaps.length) {
    const gap = empGaps[0];
    diagnostics.push({
      severity: gap.months >= 24 ? "warning" : "info",
      title: "Trou d'emploi non justifié",
      body: `Un écart d'environ ${gap.months} mois entre deux expériences (${gap.from}–${gap.to}) peut interroger. Expliquez-le brièvement si pertinent.`,
      tip: "→ Mentionnez l'activité durant cette période : formation, projet, bénévolat, création d'entreprise.",
      checkId: "employment_gap",
    });
  }

  const academicCount = ACADEMIC_MARKERS.filter((m) => text.toLowerCase().includes(m)).length;
  if (academicCount >= 3 && !scores.keywords?.jdOverlap) {
    diagnostics.push({
      severity: "info",
      title: "Profil académique — adapter le langage si besoin",
      body: "Si vous ciblez le privé, reformulez publications/thèse en impact et résultats applicables.",
      tip: "→ Mettez en avant budgets, livrables, collaborations et résultats mesurables.",
    });
  }

  if (scores.readability?.pages > 2) {
    diagnostics.push({
      severity: "warning",
      title: "CV trop long pour les filtres ATS",
      body: "Au-delà de 2 pages, le signal dilue et certains parseurs tronquent le contenu.",
      tip: "→ Condenser expériences anciennes et retirer les détails non pertinents.",
      checkId: "page_length",
    });
  }

  if (scores.readability?.hasTables) {
    diagnostics.push({
      severity: "warning",
      title: "Tableaux hostiles aux ATS",
      body: "Les grilles de tableaux font souvent lire les cellules dans le désordre.",
      tip: "→ Convertissez les tableaux en listes ou paragraphes mono-colonne dans votre fichier d’origine.",
      checkId: "no_tables",
    });
  } else if (scores.readability?.hasColumnsSmell) {
    diagnostics.push({
      severity: "warning",
      title: "Colonnes potentiellement hostiles ATS",
      body: "Une mise en page à colonnes peut inverser l’ordre de lecture des robots.",
      tip: "→ Préférez une lecture linéaire (une colonne) pour les candidatures ATS.",
      checkId: "single_column",
    });
  }

  if (scores.readability?.imageOnly || (scores.readability?.imageOnlyPages || []).length > 0) {
    diagnostics.push({
      severity: "critical",
      title: "CV image / scan peu extractible",
      body: "Peu de texte sélectionnable — les ATS ne lisent pas les pages image.",
      tip: "→ Exportez un PDF texte ou un DOCX (pas une photo ni un export aplati).",
      checkId: "extractable_text",
    });
  }

  if (scores.readability?.cvSource?.hostile) {
    const tool = scores.readability.cvSource.label || scores.readability.cvSource.id;
    diagnostics.push({
      severity: "critical",
      title: `CV créé avec ${tool} — crédibilité en jeu`,
      body: "Canva, builders IA et templates graphiques brouillent souvent le parsing ATS et peuvent paraître génériques aux recruteurs.",
      tip: "→ Reprenez le contenu en Word/Google Docs, texte linéaire mono-colonne.",
      checkId: "cv_source",
    });
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      severity: "info",
      title: "Quelques ajustements possibles",
      body: "Votre CV est déjà bien positionné. Affinez les mots-clés selon chaque offre ciblée.",
      tip: "→ Adaptez 5–8 mots-clés de l'annonce dans vos expériences.",
    });
  }

  return diagnostics;
}

function labelForScore(total) {
  if (total >= 85) return { text: "Excellent", color: "text-green", stroke: "#22c55e" };
  if (total >= 70) return { text: "Bon", color: "text-green", stroke: "#22c55e" };
  if (total >= 50) return { text: "Moyen", color: "text-amber", stroke: "#f59e0b" };
  return { text: "Faible", color: "text-red", stroke: "#ef4444" };
}

function barClass(score, max = 25) {
  const pct = score / max;
  if (pct >= 0.8) return "bg-green";
  if (pct >= 0.55) return "bg-amber";
  return "bg-red";
}

function scoreColor(score, max = 25) {
  const pct = score / max;
  if (pct >= 0.8) return "text-green";
  if (pct >= 0.55) return "text-amber";
  return "text-red";
}

/**
 * @param {string} rawText
 * @param {{
 *   fileName?: string,
 *   pages?: number,
 *   fileType?: string,
 *   lang?: 'fr'|'en',
 *   parsed?: object,
 *   skillsMatch?: object,
 *   verbStats?: object,
 *   jdOverlap?: object,
 *   tableCount?: number,
 *   jobDescription?: string
 * }} fileMeta
 */
export function analyzeCv(rawText, fileMeta = {}) {
  const text = normalizeText(rawText);
  if (!text || text.replace(/\s/g, "").length < 40) {
    throw new Error(
      "Impossible d'extraire suffisamment de texte. Vérifiez que le fichier n'est pas un scan/image protégé."
    );
  }

  const uiLang = fileMeta.lang === "en" ? "en" : "fr";
  const detectedLang = detectLanguage(text);
  const parsed =
    fileMeta.parsed ||
    parseCv(text, {
      pagesGeo: fileMeta.pagesGeo || null,
      tableCount: fileMeta.tableCount || 0,
      tableHint: fileMeta.tableHint,
      headerSparse: fileMeta.headerSparse,
      readingOrderOk: fileMeta.readingOrderOk,
      profilePhotoHint: fileMeta.profilePhotoHint,
    });

  let spelling =
    fileMeta.spelling ||
    findSpellingIssues(text, detectedLang, fileMeta.techWhitelist || null);
  const grammar = findGrammarIssues(text, detectedLang);
  if (grammar.length) {
    const seen = new Set(spelling.map((s) => `${s.textStart}:${s.wrong}`.toLowerCase()));
    for (const g of grammar) {
      const key = `${g.textStart}:${g.wrong}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      spelling = [...spelling, g];
    }
  }

  const meta = { ...fileMeta, parsed, spelling, lang: detectedLang };

  const readability = scoreReadability(text, meta);
  const structure = scoreStructure(text, meta);
  const content = scoreContent(text, meta);
  const keywords = scoreKeywords(text, meta);
  const checklist = buildChecklist(readability, structure, content, keywords);

  const total = readability.score + structure.score + content.score + keywords.score;
  let label = labelForScore(total);
  const tags = buildTags(text, content, structure);
  const diagnostics = buildDiagnostics(text, { readability, structure, content, keywords });
  const annotations = buildAnnotations(
    text,
    { readability, structure, content, keywords },
    spelling,
    uiLang,
    parsed
  );

  const strengths = [
    ...readability.checks.filter((c) => c.ok === true).map((c) => ({ category: "Lisibilité ATS", ...c })),
    ...structure.checks.filter((c) => c.ok === true).map((c) => ({ category: "Structure", ...c })),
    ...content.checks.filter((c) => c.ok === true).map((c) => ({ category: "Qualité du contenu", ...c })),
    ...keywords.checks.filter((c) => c.ok === true).map((c) => ({ category: "Mots-clés", ...c })),
  ];

  const blockers = [
    ...readability.checks.filter((c) => c.ok === false).map((c) => ({ category: "Lisibilité ATS", ...c })),
    ...structure.checks.filter((c) => c.ok === false).map((c) => ({ category: "Structure", ...c })),
    ...content.checks.filter((c) => c.ok === false).map((c) => ({ category: "Qualité du contenu", ...c })),
    ...keywords.checks.filter((c) => c.ok === false).map((c) => ({ category: "Mots-clés", ...c })),
  ];

  if (uiLang === "en") {
    const translateCategory = (cat) => {
      switch (cat) {
        case "Lisibilité ATS":
          return "ATS readability";
        case "Qualité du contenu":
          return "Content quality";
        case "Mots-clés":
          return "Keywords";
        default:
          return cat;
      }
    };

    const translateCheckLabel = (label) => {
      const s = String(label || "").trim();
      const exact = {
        "Texte correctement extractible par les ATS.": "Text clearly extractable by ATS.",
        "Texte difficilement extractible — le CV semble scanné ou en image.":
          "Text hard to extract — the CV looks scanned/image-based.",
        "Mise en page linéaire, favorable aux ATS.":
          "Linear layout, ATS-friendly.",
        "Caractères illisibles détectés (encodage ou OCR défaillant).":
          "Unreadable characters detected (encoding/OCR issue).",
        "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte.":
          "Column/table layout clues — some ATS may mix text order.",
        "Tableaux détectés — certains ATS mélangent l'ordre des cellules.":
          "Tables detected — some ATS mix cell reading order.",
        "Pas de tableaux détectés.": "No tables detected.",
        "Mise en page mono-colonne.": "Single-column layout.",
        "Ordre de lecture cohérent.": "Consistent reading order.",
        "Ordre de lecture incohérent (colonnes/sidebar) — risque de mélange ATS.":
          "Inconsistent reading order (columns/sidebar) — ATS scramble risk.",
        "Bandeau haut peu textuel — contact probablement dans une image/en-tête graphique.":
          "Sparse top band — contact likely in an image/graphic header.",
        "Compétences représentées en graphiques (étoiles/barres) — illisibles pour les ATS.":
          "Skills shown as graphics (stars/bars) — ATS cannot read them.",
        "Coordonnées en texte clair.": "Contact details in plain text.",
        "Coordonnées absentes ou non textuelles.": "Contact details missing or not plain text.",
        "Nom candidat détecté.": "Candidate name detected.",
        "Nom candidat peu identifiable.": "Candidate name not clearly identifiable.",
        "Prénom et nom clairement identifiés.": "First and last name clearly identified.",
        "Prénom/nom absents ou peu identifiables (évitez un intitulé de poste à la place).":
          "First/last name missing or unclear (avoid a job title instead).",
        "Localisation détectée.": "Location detected.",
        "Adresse ou localisation détectée.": "Address or location detected.",
        "Localisation absente (ville/CP) — utile pour le filtrage ATS.":
          "Location missing (city/ZIP) — useful for ATS filtering.",
        "Localisation absente (ville/adresse) — utile pour le filtrage ATS.":
          "Location missing (city/address) — useful for ATS filtering.",
        "Intitulé (headline) sous le nom détecté.": "Headline job title under the name detected.",
        "Pas d'intitulé clair sous le nom — ajoutez un titre de poste ciblé.":
          "No clear headline under the name — add a target job title.",
        "Centres d'intérêt absents (optionnel).": "Interests section absent (optional).",
        "Centres d'intérêt : non applicable (section absente).":
          "Interests: not applicable (section absent).",
        "Photo de profil : non applicable (aucune détectée).":
          "Profile photo: not applicable (none detected).",
        "Dates de postes : non applicable (aucun rôle détecté).":
          "Role dates: not applicable (no roles detected).",
        "Section Centres d'intérêt vide — complétez ou retirez le titre.":
          "Interests section empty — fill it or remove the heading.",
        "Centres d'intérêt trop génériques — cibler 3–5 intérêts parlants.":
          "Interests too generic — aim for 3–5 meaningful items.",
        "Centres d'intérêt présents et exploitables.": "Interests present and useful.",
        "Aucun poste avec dates début/fin (ou « en cours ») parsable.":
          "No role with start/end dates (or “present”) parseable.",
        "Dates de postes : non applicable (aucun rôle détecté).":
          "Role dates: not applicable (no roles detected).",
        "Photo de profil détectée — souvent ignorée ou nuisible aux parseurs ATS ; préférez le texte.":
          "Profile photo detected — often ignored or harmful to ATS parsers; prefer plain text.",
        "Pas de photo de profil détectée en en-tête.": "No profile photo detected in the header.",
        "Orthographe : pas de faute fréquente détectée.": "Spelling: no common issues detected.",
        "Grammaire : pas de tournure douteuse détectée.": "Grammar: no doubtful wording detected.",
        "Au moins un poste avec intitulé, entreprise et dates.":
          "At least one role with title, company and dates.",
        "Aucun poste complet (intitulé + entreprise + dates) parsable.":
          "No complete role (title + company + dates) parseable.",
        "Titres de sections standards détectés.": "Standard section headings detected.",
        "Titres de sections standards recommandés.": "Standard section headings recommended.",
        "Titres de sections non lisibles par un ATS (Expérience/Formation/Compétences).":
          "Section headings not ATS-readable (Experience/Education/Skills).",
        "Titres de sections non lisibles par un ATS (Expérience).":
          "Section headings not ATS-readable (Experience).",
        "Titres de sections non lisibles par un ATS (Formation).":
          "Section headings not ATS-readable (Education).",
        "Titres de sections non lisibles par un ATS (Compétences).":
          "Section headings not ATS-readable (Skills).",
        "Titres de sections non lisibles par un ATS (Expérience/Formation).":
          "Section headings not ATS-readable (Experience/Education).",
        "Titres de sections non lisibles par un ATS (Expérience/Compétences).":
          "Section headings not ATS-readable (Experience/Skills).",
        "Titres de sections non lisibles par un ATS (Formation/Compétences).":
          "Section headings not ATS-readable (Education/Skills).",
        "Longueur idéale (1 page).": "Ideal length (1 page).",
        "CV un peu long (3 pages) — visez 1 à 2 pages.":
          "A bit long (3 pages) — aim for 1 to 2 pages.",
        "Adresse e-mail présente.": "Email address present.",
        "Aucune adresse e-mail détectée.": "No email address detected.",
        "Numéro de téléphone détecté.": "Phone number detected.",
        "Téléphone manquant ou non reconnu.": "Phone number missing or unrecognized.",
        "Profil LinkedIn mentionné.": "LinkedIn profile mentioned.",
        "Lien LinkedIn absent.": "LinkedIn link missing.",
        "Titre/intitulé de poste présent.": "Job title present.",
        "Intitulé de poste peu identifiable en tête de CV.":
          "Job title not clearly identifiable at the top.",
        "Section Expérience clairement identifiée.":
          "Experience section clearly identified.",
        "Section Expérience non détectée.": "Experience section missing.",
        "Section Formation présente.": "Education/Training section present.",
        "Section Formation absente ou mal intitulée.":
          "Education/Training section missing or poorly titled.",
        "Section Compétences présente.": "Skills section present.",
        "Section Compétences manquante.": "Skills section missing.",
        "Verbes d'action quasi absents — reformulez en réalisations.":
          "Action verbs almost absent — rephrase as achievements.",
        "Quelques chiffres — ajoutez davantage de métriques.":
          "Some figures — add more metrics.",
        "Presque aucun résultat chiffré — les ATS et RH valorisent les preuves.":
          "Almost no quantified results — ATS and HR value proof.",
        "Bonne diversité lexicale pour matcher les offres.":
          "Good lexical diversity to match job postings.",
        "Diversifiez le vocabulaire (outils, soft skills, domaines).":
          "Diversify vocabulary (tools, soft skills, domains).",
        "Peu de mots-clés métier — alignez-vous sur les offres cibles.":
          "Few industry keywords — align with target job postings.",
      };
      if (exact[s]) return exact[s];

      let m;
      m = s.match(/^Longueur acceptable \((\d+) pages\)\.$/);
      if (m) return `Acceptable length (${m[1]} pages).`;

      m = s.match(/^CV trop long \((\d+) pages\) — risque de rejet ATS\/RH\.$/);
      if (m) return `Too long (${m[1]} pages) — risk of ATS/HR rejection.`;

      m = s.match(/^Longueur acceptable \((\d+) page\)\.$/);
      if (m) return `Acceptable length (${m[1]} page).`;

      m = s.match(/^Verbes d'action bien utilisés \((\d+)\)\.$/);
      if (m) return `Action verbs used (${m[1]}).`;

      m = s.match(/^Peu de verbes d'action \((\d+)\) — renforcez l'impact\.$/);
      if (m) return `Few action verbs (${m[1]}) — strengthen your impact.`;

      m = s.match(/^Résultats chiffrés présents \((\d+) indicateurs\)\.$/);
      if (m) return `Quantified results present (${m[1]} indicators).`;

      m = s.match(/^Résultats chiffrés présents \((\d+)\/(\d+) puces\)\.$/);
      if (m) return `Quantified results present (${m[1]}/${m[2]} bullets).`;

      m = s.match(/^Formulations faibles détectées \((\d+)\) — préférez des verbes d'action\.$/);
      if (m) return `Weak wording detected (${m[1]}) — prefer action verbs.`;

      m = s.match(/^Alignement offre ↔ CV : (\d+)% \(must (\d+)%, (\d+) termes communs\)\.$/);
      if (m) return `Job ↔ CV alignment: ${m[1]}% (must ${m[2]}%, ${m[3]} shared terms).`;

      m = s.match(/^Faible alignement offre \((\d+)%\) — must absents : (.+)\.$/);
      if (m) return `Weak job alignment (${m[1]}%) — missing must-haves: ${m[2]}.`;

      m = s.match(/^Faible alignement avec l'offre \((\d+)%\) — reprenez les termes clés\.$/);
      if (m) return `Weak job alignment (${m[1]}%) — reuse key terms.`;

      m = s.match(/^Sur-représentation soft \((\d+)\) vs hard \((\d+)\) — privilégiez outils et méthodes\.$/);
      if (m) return `Soft skills dominate (${m[1]}) vs hard (${m[2]}) — prefer tools and methods.`;

      m = s.match(/^Alignement offre ↔ CV : (\d+)% \((\d+) termes communs\)\.$/);
      if (m) return `Job ↔ CV alignment: ${m[1]}% (${m[2]} shared terms).`;

      m = s.match(/^Concision correcte \(~(\d+) mots\)\.$/);
      if (m) return `Proper concision (~${m[1]} words).`;

      m = s.match(/^Contenu trop court \(~(\d+) mots\)\.$/);
      if (m) return `Too little content (~${m[1]} words).`;

      m = s.match(/^Contenu dense \(~(\d+) mots\) — allégez\.$/);
      if (m) return `Dense content (~${m[1]} words) — streamline it.`;

      m = s.match(/^Vocabulaire professionnel riche \((\d+) mots-clés\)\.$/);
      if (m) return `Rich professional vocabulary (${m[1]} keywords).`;

      m = s.match(/^Densité de mots-clés moyenne \((\d+)\)\.$/);
      if (m) return `Average keyword density (${m[1]}).`;

      m = s.match(/^Dates présentes sur (\d+)\/(\d+) poste\(s\)\.$/);
      if (m) return `Dates present on ${m[1]}/${m[2]} role(s).`;

      m = s.match(/^Orthographe : (\d+) faute\(s\) fréquente\(s\) \(−(\d+) pt\)\.$/);
      if (m) return `Spelling: ${m[1]} common issue(s) (−${m[2]} pt).`;

      m = s.match(/^Grammaire : (\d+) tournure\(s\) à corriger\.$/);
      if (m) return `Grammar: ${m[1]} wording issue(s) to fix.`;

      m = s.match(/^Page\(s\) quasi image\/scan détectée\(s\) : (.+)\.$/);
      if (m) return `Near image/scan page(s) detected: ${m[1]}.`;

      m = s.match(/^CV probablement créé avec (.+) — risque ATS et crédibilité\.$/);
      if (m) return `CV likely built with ${m[1]} — ATS and credibility risk.`;

      m = s.match(/^Source favorable détectée \((.+)\)\.$/);
      if (m) return `Favourable source detected (${m[1]}).`;

      m = s.match(/^Métriques insuffisantes \((\d+)\/(\d+) sur 2 rôles récents — seuil 50 %\)\.$/);
      if (m) return `Insufficient metrics (${m[1]}/${m[2]} on 2 recent roles — 50% threshold).`;

      m = s.match(/^(\d+) verbe\(s\) d'action sans chiffre — créditez l'impact avec une métrique\.$/);
      if (m) return `${m[1]} action verb(s) without a metric — credit the impact with a KPI.`;

      m = s.match(/^Trop de formulations faibles \((\d+)\) — remplacez par des verbes d'action\.$/);
      if (m) return `Too many weak formulations (${m[1]}) — replace with action verbs.`;

      m = s.match(/^Texte extractible mais sparse — complétez le contenu ou vérifiez l'export\.$/);
      if (m) return `Extractable but sparse text — add content or check the export.`;

      return s;
    };

    const translateScoreLabel = (lbl) => {
      const map = {
        Excellent: "Excellent",
        Bon: "Good",
        Moyen: "Average",
        Faible: "Low",
      };
      return { ...lbl, text: map[lbl.text] || lbl.text };
    };

    label = translateScoreLabel(label);

    diagnostics.forEach((d) => {
      const months = d.body?.match(/environ (\d+) mois/)?.[1];
      const gapRange = d.body?.match(/\((\d+)–(\d+)\)/);
      const from = gapRange?.[1];
      const to = gapRange?.[2];

      const map = {
        "Trou d'emploi non justifié": {
          title: "Unexplained employment gap",
          body: `An unexplained employment gap of about ${months || "—"} months between roles (${from || "—"}–${to || "—"}) may raise questions. Explain it briefly if relevant.`,
          tip:
            "→ Mention what you did during that period: training, project, volunteering, or starting a business.",
        },
        "Profil académique — adapter le langage si besoin": {
          title: "Academic profile — adapt the language if needed",
          body:
            "If you target the private sector, reframe publications/thesis as impact and applicable results.",
          tip: "→ Highlight budgets, deliverables, collaborations and measurable outcomes.",
        },
        "Profil académique non traduit en langage business": {
          title: "Academic profile not translated into business language",
          body:
            "Your academic profile does not speak naturally to recruiters in the private sector. Publications and your thesis should take a back seat.",
          tip:
            "→ Reframe your research in terms of impact, budget you managed, and results applicable to the industry.",
        },
        "Mise en page potentiellement hostile ATS": {
          title: "Layout may be ATS-hostile",
          body: "Columns or tables can make some parsers read text out of order.",
          tip: "→ Prefer linear reading order (single column) in your original file; avoid columns and tables for ATS applications.",
        },
        "Manque de résultats chiffrés": {
          title: "Missing quantified results",
          body:
            "Without metrics (%, €, volumes, deadlines), your impact is hard for an ATS to score and for HR to evaluate.",
          tip: "→ Add metrics on ≥ 50% of bullets in your 2 most recent roles.",
        },
        "E-mail manquant": {
          title: "Missing email",
          body: "No email detected in plain text.",
          tip: "→ Place your email in plain text at the top of the CV.",
        },
        "Téléphone manquant": {
          title: "Missing phone number",
          body: "No phone number detected in plain text.",
          tip: "→ Add a reachable number as text (not inside an image).",
        },
        "Nom candidat peu identifiable": {
          title: "Candidate name not clearly identifiable",
          body: "First/last name missing or unclear at the top of the CV.",
          tip: "→ Put First Last as selectable text at the top of the document.",
        },
        "Titres de sections non standards": {
          title: "Non-standard section headings",
          body: "ATS-friendly headings (Experience / Education / Skills) were not detected.",
          tip: "→ Use Experience / Education / Skills (ATS labels).",
        },
        "Densité de mots-clés hard insuffisante": {
          title: "Insufficient hard keyword density",
          body: "Too few concrete tools/methods detected.",
          tip: "→ List concrete tools and methods (not only soft skills).",
        },
        "Termes hard du pack métier manquants": {
          title: "Missing hard terms from role pack",
          body: "Your CV is missing key hard skills for the inferred role pack.",
          tip: "→ Complete the Skills section with tools from your target role.",
        },
        "Coordonnées incomplètes": {
          title: "Incomplete contact details",
          body:
            "An ATS and recruiters must be able to reach you immediately. Email and phone are essential.",
          tip:
            "→ Place your email + phone at the top of the CV, in plain text (not inside an image).",
        },
        "CV trop long pour les filtres ATS": {
          title: "CV too long for ATS filters",
          body:
            "Beyond 2 pages, the signal dilutes and some parsers truncate content.",
          tip: "→ Condense older experiences and remove non-relevant details.",
        },
        "Tableaux hostiles aux ATS": {
          title: "Tables hostile to ATS",
          body: "Table grids often make ATS read cells out of order.",
          tip: "→ Convert tables to single-column lists or paragraphs in your original file.",
        },
        "Colonnes potentiellement hostiles ATS": {
          title: "Columns potentially hostile to ATS",
          body: "A multi-column layout can reverse reading order for bots.",
          tip: "→ Prefer linear reading (one column) for ATS applications.",
        },
        "CV image / scan peu extractible": {
          title: "Image / scan CV — little extractable text",
          body: "Little selectable text — ATS cannot read image pages.",
          tip: "→ Export a text PDF or DOCX (not a photo or flattened export).",
        },
        "Formulations passives ou descriptives": {
          title: "Passive or descriptive wording",
          body:
            "Task lists (“responsable de...”) score lower than action verbs.",
          tip: "→ Prefer: led, developed, increased, reduced, launched…",
        },
        "Quelques ajustements possibles": {
          title: "Some improvements possible",
          body:
            "Your CV is already well positioned. Fine-tune keywords for each targeted job posting.",
          tip: "→ Adapt 5–8 terms from the job description into your experiences.",
        },
      };

      const repl = map[d.title];
      if (repl) {
        d.title = repl.title;
        d.body = repl.body;
        d.tip = repl.tip;
      } else {
        const hostile = d.title?.match(/^CV créé avec (.+) — crédibilité en jeu$/);
        if (hostile) {
          d.title = `CV built with ${hostile[1]} — credibility at risk`;
          d.body =
            "Canva, AI builders and graphic templates often scramble ATS parsing and can look generic to recruiters.";
          d.tip = "→ Rewrite in Word/Google Docs as linear single-column text.";
        }
      }

      void from;
      void to;
    });

    const translateTags = (tagsList) => {
      const tagMap = {
        RH: "HR",
        "Sans métriques": "Without metrics",
        "Profil académique": "Academic profile",
        "Sans LinkedIn": "No LinkedIn",
        Tech: "Tech",
        Finance: "Finance",
        Marketing: "Marketing",
      };
      return tagsList.map((t) => tagMap[t] || t);
    };

    tags.splice(0, tags.length, ...translateTags(tags));

    const translateAnnotation = (ann) => {
      // Copy already built in uiLang by buildAnnotations — only localize section labels
      const out = { ...ann };
      const sectionMap = {
        Coordonnées: "Contact details",
        Document: "Document",
        Expérience: "Experience",
        Formation: "Education",
        Compétences: "Skills",
        Profil: "Profile",
        Langues: "Languages",
      };
      if (out.section && sectionMap[out.section]) out.section = sectionMap[out.section];
      return out;
    };

    for (let i = 0; i < annotations.length; i++) {
      annotations[i] = translateAnnotation(annotations[i]);
    }

    strengths.forEach((s) => {
      s.category = translateCategory(s.category);
      s.label = translateCheckLabel(s.label);
    });
    blockers.forEach((b) => {
      b.category = translateCategory(b.category);
      b.label = translateCheckLabel(b.label);
    });
    checklist.forEach((c) => {
      c.label = translateCheckLabel(c.label);
    });
  }

  const emailOk = structure.checks.some((c) => c.id === "email" && c.ok === true);
  const phoneOk = structure.checks.some((c) => c.id === "phone" && c.ok === true);
  const nameOk = structure.checks.some((c) => c.id === "identity_name" && c.ok === true);
  const completeRoleOk = structure.checks.some((c) => c.id === "complete_role" && c.ok === true);
  const roleDatesOk = structure.checks.some((c) => c.id === "role_dates" && c.ok === true);
  const metricsOk = content.checks.some((c) => c.id === "metrics" && c.ok === true);
  const actionVerbsOk = content.checks.some((c) => c.id === "action_verbs" && c.ok === true);
  const eduOk = structure.checks.some((c) => c.id === "section_education" && c.ok === true);
  const skillsOk = structure.checks.some((c) => c.id === "section_skills" && c.ok === true);
  const standardHeadingsOk =
    !!readability.standardHeadings ||
    (!!structure.hasExp && eduOk && skillsOk) ||
    structure.checks.some((c) => c.id === "standard_headings" && c.ok === true);
  const softStuffingKo = keywords.checks.some(
    (c) => c.id === "keyword_soft_stuffing" && c.ok === false
  );
  const noColumnIssue = !readability.hasColumnsSmell;
  const noTableIssue = !readability.hasTables;
  const noHostileSource = !readability.cvSource?.hostile;
  const passes =
    total >= 72 &&
    readability.score >= 15 &&
    !!structure.hasExp &&
    emailOk &&
    phoneOk &&
    nameOk &&
    noColumnIssue &&
    noTableIssue &&
    noHostileSource &&
    standardHeadingsOk &&
    !softStuffingKo &&
    (completeRoleOk || roleDatesOk) &&
    metricsOk &&
    actionVerbsOk &&
    eduOk &&
    skillsOk;

  return {
    fileName: fileMeta.fileName || "CV",
    lang: detectedLang,
    total,
    label,
    passes,
    tags,
    cvSource: readability.cvSource || detectCvSource(fileMeta),
    documentProfile: readability.documentProfile || null,
    categories: {
      readability: {
        name: uiLang === "en" ? "ATS readability" : "Lisibilité ATS",
        score: readability.score,
        max: 25,
        desc:
          uiLang === "en"
            ? "Extractable text, layout and encoding — can your CV be read by an ATS?"
            : "Texte extractible, mise en page, encodage — est-ce que votre CV peut être lu par un robot ?",
        bar: barClass(readability.score),
        color: scoreColor(readability.score),
        hasTables: !!readability.hasTables,
        hasColumnsSmell: !!readability.hasColumnsSmell,
        imageOnly: !!readability.imageOnly,
        imageOnlyPages: readability.imageOnlyPages || [],
      },
      structure: {
        name: uiLang === "en" ? "Structure" : "Structure",
        score: structure.score,
        max: 25,
        desc:
          uiLang === "en"
            ? "Key sections, job title and contact details — is your CV well organized?"
            : "Sections clés, titre métier, coordonnées — votre CV est-il bien organisé ?",
        bar: barClass(structure.score),
        color: scoreColor(structure.score),
      },
      content: {
        name: uiLang === "en" ? "Content quality" : "Qualité du contenu",
        score: content.score,
        max: 25,
        desc:
          uiLang === "en"
            ? "Action verbs, quantified results and concision — is your CV impactful?"
            : "Verbes d'action, résultats chiffrés, concision — votre CV est-il percutant ?",
        bar: barClass(content.score),
        color: scoreColor(content.score),
      },
      keywords: {
        name: uiLang === "en" ? "Keywords" : "Mots-clés",
        score: keywords.score,
        max: 25,
        desc:
          uiLang === "en"
            ? "Keyword density and diversity to match job postings."
            : "Densité et diversité du vocabulaire professionnel pour matcher les offres.",
        bar: barClass(keywords.score),
        color: scoreColor(keywords.score),
        found: keywords.keywords,
      },
    },
    diagnostics,
    strengths,
    blockers,
    spelling,
    annotations,
    checklist,
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    pages: readability.pages,
    parsed: parsed || null,
    skillsMatch: fileMeta.skillsMatch || null,
    jdOverlap: fileMeta.jdOverlap || keywords.jdOverlap || null,
    layoutHostile: !!(
      readability.hasColumnsSmell ||
      readability.hasTables ||
      readability.cvSource?.hostile
    ),
  };
}

/**
 * Async analyze: structured parse + lazy lexicons + optional JD overlap + spelling whitelist.
 * @param {string} rawText
 * @param {object} [fileMeta]
 * @param {{ jobDescription?: string }} [opts]
 */
export async function analyzeCvAsync(rawText, fileMeta = {}, opts = {}) {
  const {
    preloadAnalysisData,
    matchSkills,
    matchJdOverlap,
    matchRoleKeywordGaps,
    countVerbs,
    loadTechWhitelist,
    loadAtsLayoutRules,
  } = await import("./skills-match.js");

  await preloadAnalysisData();
  let techWhitelist = null;
  let layoutRules = null;
  try {
    techWhitelist = await loadTechWhitelist();
  } catch {
    techWhitelist = null;
  }
  try {
    layoutRules = await loadAtsLayoutRules();
  } catch {
    layoutRules = null;
  }

  const parsed = parseCv(rawText, {
    pagesGeo: fileMeta.pagesGeo || null,
    tableCount: fileMeta.tableCount || 0,
    tableHint: fileMeta.tableHint,
    headerSparse: fileMeta.headerSparse,
    readingOrderOk: fileMeta.readingOrderOk,
    profilePhotoHint: fileMeta.profilePhotoHint,
  });
  const detectedLang = detectLanguage(normalizeText(rawText));
  const expScope = (parsed?.sections?.experience || []).join("\n");
  const skillsScope = (parsed?.sections?.skills || []).join("\n");
  const recentBullets = (parsed?.roles || [])
    .slice(0, 2)
    .flatMap((r) => r.bullets || [])
    .join("\n");
  const focusedSkillsText = [skillsScope, recentBullets].filter((s) => s && s.trim()).join("\n");

  const [skillsMatch, sectionSkills, verbStats, roleKeywordGaps] = await Promise.all([
    matchSkills(rawText),
    focusedSkillsText.trim().length >= 20 ? matchSkills(focusedSkillsText) : Promise.resolve(null),
    countVerbs(rawText, detectedLang === "en" ? "en" : "fr", {
      scope: expScope && expScope.length >= 40 ? expScope : undefined,
    }),
    matchRoleKeywordGaps(rawText, {
      headline: parsed?.headline || "",
      roleTitle: parsed?.roles?.[0]?.title || "",
    }),
  ]);

  if (sectionSkills?.hardHits?.length) {
    skillsMatch.sectionHardHits = sectionSkills.hardHits;
  }

  let jdOverlap = null;
  const jd = (opts.jobDescription || fileMeta.jobDescription || "").trim();
  if (jd) {
    jdOverlap = await matchJdOverlap(rawText, jd, {
      headline: parsed?.headline || "",
      roleTitle: parsed?.roles?.[0]?.title || "",
    });
  }

  let spelling = findSpellingIssues(normalizeText(rawText), detectedLang, techWhitelist);
  spelling = await enrichSpellingWithNspell(
    normalizeText(rawText),
    detectedLang,
    spelling,
    techWhitelist
  );
  const grammar = findGrammarIssues(normalizeText(rawText), detectedLang);
  if (grammar.length) {
    const seen = new Set(spelling.map((s) => `${s.textStart}:${s.wrong}`.toLowerCase()));
    for (const g of grammar) {
      const key = `${g.textStart}:${g.wrong}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      spelling.push(g);
    }
  }

  return analyzeCv(rawText, {
    ...fileMeta,
    parsed,
    skillsMatch,
    verbStats,
    jdOverlap,
    roleKeywordGaps,
    techWhitelist,
    spelling,
    layoutRules,
  });
}

export { labelForScore, buildAnnotations, findSpellingIssues };

/**
 * Fusionne grammaire LT / géocode / classification photo dans un rapport déjà calculé.
 * @param {object} report
 * @param {{ grammar?: { issues?: object[] }, geo?: object, photo?: object }} enrich
 * @param {{ lang?: string }} [opts]
 */
export function mergeRemoteEnrichment(report, enrich = {}, opts = {}) {
  if (!report) return report;
  const isEn = opts.lang === "en";
  if (enrich.grammar) {
    const issues = enrich.grammar.issues || [];
    const spelling = [...(report.spelling || [])];
    const seen = new Set(spelling.map((s) => `${s.textStart}:${String(s.wrong || "").toLowerCase()}`));
    for (const issue of issues) {
      const key = `${issue.textStart ?? ""}:${String(issue.wrong || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      spelling.push({
        wrong: issue.wrong,
        right: issue.right || issue.wrong,
        context: issue.context || "",
        textStart: issue.textStart ?? 0,
        textEnd: issue.textEnd ?? (issue.textStart ?? 0) + String(issue.wrong || "").length,
        kind: issue.kind === "typo" ? "typo" : "grammar",
      });
    }
    report.spelling = spelling;

    // Rebuild grammar/typo annotations from new issues only
    let seq = (report.annotations || []).length;
    for (const s of issues) {
      const isGrammar = s.kind !== "typo";
      seq += 1;
      report.annotations = report.annotations || [];
      report.annotations.push({
        id: `ann-enrich-${seq}`,
        page: 1,
        rects: [],
        approximate: s.textStart == null,
        status: "pending",
        section: "Document",
        axis: "content",
        kind: isGrammar ? "grammar" : "typo",
        shortLabel: isGrammar ? (isEn ? "Grammar" : "Grammaire") : isEn ? "Spelling" : "Orthographe",
        severity: isGrammar ? "warning" : "critical",
        textStart: s.textStart ?? 0,
        textEnd: s.textEnd ?? 0,
        quote: s.wrong,
        title: isEn
          ? `Fix « ${s.wrong} » → « ${s.right} »`
          : `Corriger « ${s.wrong} » → « ${s.right} »`,
        detail: s.context || s.message || "",
        suggestion: s.right || "",
        applyMode: "replace",
        checkId: isGrammar ? "grammar_quality" : "spelling_quality",
      });
    }

    // LanguageTool (or enrich) ran → deep verification; 0 hits = ok:true (not na)
    const typoCount = spelling.filter((s) => s.kind !== "grammar").length;
    const grammarCount = spelling.filter((s) => s.kind === "grammar").length;
    upsertCheck(
      report,
      "spelling_quality",
      typoCount === 0,
      typoCount === 0
        ? isEn
          ? "Spelling: no common issues detected."
          : "Orthographe : pas de faute fréquente détectée."
        : isEn
          ? `Spelling: ${typoCount} common issue(s).`
          : `Orthographe : ${typoCount} faute(s) fréquente(s).`
    );
    upsertCheck(
      report,
      "grammar_quality",
      grammarCount === 0,
      grammarCount === 0
        ? isEn
          ? "Grammar: no doubtful wording detected."
          : "Grammaire : pas de tournure douteuse détectée."
        : isEn
          ? `Grammar: ${grammarCount} wording issue(s) to fix.`
          : `Grammaire : ${grammarCount} tournure(s) à corriger.`
    );

    // Light content score penalty if not already low
    if (report.categories?.content && (typoCount || grammarCount)) {
      const pen = Math.min(4, typoCount) + Math.min(2, grammarCount);
      report.categories.content.score = Math.max(0, report.categories.content.score - pen);
      report.total = Math.max(
        0,
        (report.categories.readability?.score || 0) +
          (report.categories.structure?.score || 0) +
          report.categories.content.score +
          (report.categories.keywords?.score || 0)
      );
    }
  }

  if (enrich.geo) {
    report.parsed = report.parsed || {};
    report.parsed.contact = report.parsed.contact || {};
    report.parsed.contact.geo = enrich.geo;
    if (enrich.geo.ok && enrich.geo.confidence >= 0.4) {
      upsertCheck(
        report,
        "identity_address",
        true,
        isEn
          ? `Address/location confirmed (geocode ${Math.round(enrich.geo.confidence * 100)}%).`
          : `Adresse/localisation confirmée (géocode ${Math.round(enrich.geo.confidence * 100)}%).`
      );
    } else if ((report.parsed.contact.location || report.parsed.contact.address) && enrich.geo.ok === false) {
      // Keep address ok but add soft annotation
      report.annotations = report.annotations || [];
      report.annotations.push({
        id: `ann-geo-${Date.now()}`,
        page: 1,
        rects: [],
        approximate: true,
        status: "pending",
        section: isEn ? "Contact details" : "Coordonnées",
        axis: "structure",
        kind: "missing_location",
        shortLabel: isEn ? "Location" : "Adresse",
        severity: "info",
        textStart: 0,
        textEnd: 20,
        quote: report.parsed.contact.location || report.parsed.contact.address || "",
        title: isEn ? "Could not verify this location" : "Localisation non vérifiée",
        detail: isEn
          ? "Geocoding did not match a known place. Prefer City or ZIP + City in plain text."
          : "Le géocodage n’a pas trouvé de lieu connu. Préférez Ville ou CP + Ville en texte clair.",
        suggestion: isEn
          ? "City or ZIP + City (plain text)"
          : "Ville ou CP + Ville (texte clair)",
        applyMode: "replace",
        checkId: "identity_address",
      });
    }
  }

  if (enrich.photo?.kind) {
    report.parsed = report.parsed || {};
    report.parsed.layout = report.parsed.layout || {};
    report.parsed.layout.photoKind = enrich.photo.kind;
    report.photoClassify = enrich.photo;
    const photoIsHeuristic = enrich.photo.source === "heuristic";
    // Heuristic stubs must not mutate score or checklist (anti-placebo)
    if (photoIsHeuristic) {
      // keep classify metadata only
    } else if (enrich.photo.kind === "logo" || enrich.photo.kind === "other") {
      upsertCheck(
        report,
        "profile_photo",
        true,
        enrich.photo.kind === "logo"
          ? (isEn
              ? "Header image classified as logo/decorative (low ATS risk)."
              : "Image d’en-tête classée logo/décoratif (risque ATS faible).")
          : (isEn
              ? "Header image classified as decorative (low ATS risk)."
              : "Image d’en-tête classée décorative (risque ATS faible).")
      );
      // Downgrade or remove face warning annotations
      report.annotations = (report.annotations || []).filter((a) => a.kind !== "profile_photo");
      if (report.categories?.readability) {
        report.categories.readability.score = Math.min(25, report.categories.readability.score + 1);
        report.total = Math.max(
          0,
          report.categories.readability.score +
            (report.categories.structure?.score || 0) +
            (report.categories.content?.score || 0) +
            (report.categories.keywords?.score || 0)
        );
      }
    } else if (enrich.photo.kind === "face") {
      upsertCheck(
        report,
        "profile_photo",
        false,
        isEn
          ? "Profile photo detected — often ignored or harmful to ATS parsers; prefer plain text."
          : "Photo de profil détectée — souvent ignorée ou nuisible aux parseurs ATS ; préférez le texte."
      );
    }
  }

  if (Array.isArray(report.checklist)) {
    // Rebuild checklist uniqueness from category checks when present
    const byId = new Map(report.checklist.map((c) => [c.id, c]));
    report.checklist = [...byId.values()];
  }
  return report;
}

function upsertCheck(report, id, ok, label) {
  if (!report.checklist) report.checklist = [];
  const existing = report.checklist.find((c) => c.id === id);
  if (existing) {
    existing.ok = ok;
    existing.label = label;
    if (ok === null) existing.na = true;
    else delete existing.na;
  } else {
    const row = { id, axis: "content", ok, label };
    if (ok === null) row.na = true;
    report.checklist.push(row);
  }
  for (const cat of Object.values(report.categories || {})) {
    // categories don't store checks on report — checklist is source of truth in UI
    void cat;
  }
  // Also patch strengths/blockers lightly
  const inBlockers = (report.blockers || []).find((b) => b.id === id);
  const inStrengths = (report.strengths || []).find((s) => s.id === id);
  if (ok === true) {
    report.blockers = (report.blockers || []).filter((b) => b.id !== id);
    if (!inStrengths) {
      report.strengths = report.strengths || [];
      report.strengths.push({ id, ok: true, label, category: "Enrichissement" });
    } else {
      inStrengths.label = label;
    }
  } else if (ok === false) {
    report.strengths = (report.strengths || []).filter((s) => s.id !== id);
    if (!inBlockers) {
      report.blockers = report.blockers || [];
      report.blockers.push({ id, ok: false, label, category: "Enrichissement" });
    } else {
      inBlockers.label = label;
    }
  } else {
    /* na — remove from both strengths and blockers */
    report.strengths = (report.strengths || []).filter((s) => s.id !== id);
    report.blockers = (report.blockers || []).filter((b) => b.id !== id);
  }
}
