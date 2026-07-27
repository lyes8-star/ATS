/**
 * Moteur d'analyse ATS — évaluations côté client
 */

const ACTION_VERBS = [
  "dirigé", "dirigée", "dirigé", "piloté", "pilotée", "géré", "gérée", "coordonné", "coordonnée",
  "développé", "développée", "conçu", "conçue", "créé", "créée", "lancé", "lancée", "mis en place",
  "amélioré", "améliorée", "optimisé", "optimisée", "augmenté", "augmentée", "réduit", "réduite",
  "négocié", "négociée", "supervisé", "supervisée", "formé", "formée", "recruté", "recrutée",
  "analysé", "analysée", "implémenté", "implémentée", "déployé", "déployée", "automatisé",
  "led", "managed", "developed", "designed", "created", "launched", "improved", "optimized",
  "increased", "reduced", "negotiated", "supervised", "trained", "recruited", "analyzed",
  "implemented", "deployed", "automated", "built", "delivered", "achieved", "drove",
  "assuré", "assurée", "réalisé", "réalisée", "conduit", "conduite", "élaboré", "élaborée",
  "structuré", "structurée", "renforcé", "renforcée", "accompagné", "accompagnée",
];

const SECTION_PATTERNS = {
  experience: /\b(exp[ée]rience|exp[ée]riences?\s+professionnelles?|parcours|emploi|career|work\s+experience|professional\s+experience)\b/i,
  education: /\b(formation|formations?|education|éducation|dipl[ôo]mes?|études|etudes|academic)\b/i,
  skills: /\b(comp[ée]tences?|skills?|savoir[-\s]?faire|technologies|outils|hard\s+skills)\b/i,
  languages: /\b(langues?|languages?)\b/i,
  summary: /\b(profil|r[ée]sum[ée]|objective|objectif|about|à propos|synth[èe]se)\b/i,
};

const JOB_TITLE_HINTS =
  /\b(d[ée]veloppeur|developer|ing[ée]nieur|engineer|manager|chef de projet|consultant|analyst|analyste|responsable|directeur|directrice|assistant|assistante|commercial|marketing|comptable|rh|ressources humaines|designer|product owner|devops|data scientist|architecte|juriste|avocat|infirmier|enseignant)\b/i;

const PROFESSIONAL_KEYWORDS = [
  "gestion", "projet", "équipe", "client", "stratégie", "budget", "performance",
  "processus", "qualité", "reporting", "kpi", "agile", "scrum", "management",
  "communication", "négociation", "analyse", "données", "digital", "innovation",
  "leadership", "collaboration", "planning", "stakeholder", "roadmap", "crm",
  "erp", "excel", "powerpoint", "sql", "python", "javascript", "java", "sap",
  "compliance", "audit", "formation", "recrutement", "vente", "commercial",
  "marketing", "finance", "comptable", "logistique", "supply chain", "ops",
  "product", "ux", "ui", "devops", "cloud", "aws", "azure", "api", "saas",
];

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
];

function normalizeText(text) {
  return (text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  return /(\+?\d[\d\s.\-]{7,}\d)|(\b0[1-9](?:[\s.\-]?\d{2}){4}\b)/.test(text);
}

function detectLinkedIn(text) {
  return /linkedin\.com\/in\/|linkedin\.com\/pub\/|\blinkedin\b/i.test(text);
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

function detectLanguage(text) {
  const frHits = (text.match(/\b(le|la|les|des|une|pour|avec|dans|expérience|formation|compétences)\b/gi) || []).length;
  const enHits = (text.match(/\b(the|and|with|for|experience|education|skills|of|to)\b/gi) || []).length;
  return frHits >= enHits ? "fr" : "en";
}

function findSpellingIssues(text, lang) {
  const issues = [];
  const seen = new Set();
  for (const tip of COMMON_TYPOS) {
    if (lang === "en" && tip.skipIfEn) continue;
    if (lang === "fr" && tip.skipIfFr) continue;
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

function sectionAnchor(text, kind) {
  const re = SECTION_PATTERNS[kind];
  if (!re) return null;
  re.lastIndex = 0;
  const m = re.exec(text);
  if (!m) return null;
  return { textStart: m.index, textEnd: m.index + m[0].length, quote: m[0] };
}

/**
 * Construit des annotations localisées (offsets + quote) à partir du rapport.
 * Les rects PDF sont enrichis plus tard via attachGeometry().
 */
function buildAnnotations(text, scores, spelling, lang) {
  const annotations = [];
  let seq = 0;
  const nextId = () => `ann-${++seq}`;

  const push = (partial) => {
    annotations.push({
      id: nextId(),
      page: 1,
      rects: [],
      approximate: true,
      status: "pending",
      section: partial.section || guessSection(text, partial.textStart || 0),
      ...partial,
    });
  };

  // Typos
  for (const s of spelling) {
    push({
      kind: "typo",
      severity: "critical",
      textStart: s.textStart,
      textEnd: s.textEnd,
      quote: s.wrong,
      title: "Corriger la faute d'orthographe",
      detail: `« ${s.wrong} » est une faute fréquente. Un CV avec des fautes envoie un signal négatif.`,
      suggestion: s.right,
      applyMode: "replace",
      approximate: false,
    });
  }

  // Passive / téléphone
  if (!detectEmail(text)) {
    push({
      kind: "missing_email",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(début du CV)",
      title: "Ajouter une adresse e-mail",
      detail: "Aucune adresse e-mail détectée. Les ATS et recruteurs doivent pouvoir vous contacter.",
      suggestion: "prenom.nom@email.com",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
    });
  }
  if (!detectPhone(text)) {
    push({
      kind: "missing_email",
      severity: "critical",
      textStart: 0,
      textEnd: Math.min(40, text.length),
      quote: text.slice(0, Math.min(40, text.length)).trim() || "(début du CV)",
      title: "Ajouter un numéro de téléphone",
      detail: "Téléphone manquant ou non reconnu. Placez-le en tête, en texte clair.",
      suggestion: "06 12 34 56 78",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
    });
  }

  // Sections manquantes
  const missingSections = [
    { key: "experience", kind: "missing_section", title: "Ajouter une section Expérience", block: "\n\nEXPÉRIENCE PROFESSIONNELLE\nIntitulé — Entreprise (AAAA - AAAA)\n- Piloté … (+X % / Y clients)\n" },
    { key: "education", kind: "missing_section", title: "Ajouter une section Formation", block: "\n\nFORMATION\nDiplôme — Établissement (AAAA - AAAA)\n" },
    { key: "skills", kind: "missing_section", title: "Ajouter une section Compétences", block: "\n\nCOMPÉTENCES\nGestion de projet, Agile, Excel, reporting, communication, analyse\n" },
  ];
  for (const ms of missingSections) {
    if (!SECTION_PATTERNS[ms.key].test(text)) {
      const end = text.length;
      push({
        kind: ms.kind,
        severity: ms.key === "experience" ? "critical" : "warning",
        textStart: Math.max(0, end - 1),
        textEnd: end,
        quote: "(fin du document)",
        title: ms.title,
        detail: `Section ${ms.key === "experience" ? "Expérience" : ms.key === "education" ? "Formation" : "Compétences"} absente ou mal intitulée.`,
        suggestion: ms.block.trim(),
        applyMode: "insert_after",
        section: "Document",
        approximate: true,
      });
    }
  }

  // Formulations passives « responsable de… »
  const passiveRe = /\bresponsable\s+de\s+[^.!\n]{8,120}/gi;
  let pm;
  let passiveCount = 0;
  while ((pm = passiveRe.exec(text)) !== null && passiveCount < 6) {
    const quote = pm[0].trim();
    const hasMetric = /\d/.test(quote);
    const suggestion = hasMetric
      ? quote.replace(/^responsable\s+de\s+/i, "Piloté ").replace(/^./, (c) => c.toUpperCase())
      : quote.replace(/^responsable\s+de\s+/i, "Piloté ") + " (+X % / N clients)";
    push({
      kind: "passive_verb",
      severity: "warning",
      textStart: pm.index,
      textEnd: pm.index + pm[0].length,
      quote,
      title: "Remplacer la formulation passive",
      detail: "Formulation passive, faible signal ATS. Préférez un verbe d'action + résultat.",
      suggestion: suggestion.charAt(0).toUpperCase() + suggestion.slice(1),
      applyMode: "replace",
      approximate: false,
    });
    passiveCount += 1;
  }

  // Puces sans métrique dans l'expérience
  if (!scores.content.hasMetrics) {
    const bulletRe = /^[\s•\-\*]+(.{20,160})$/gm;
    let bm;
    let metricAnns = 0;
    while ((bm = bulletRe.exec(text)) !== null && metricAnns < 4) {
      const line = bm[1].trim();
      if (/\d/.test(line)) continue;
      if (!/[a-záàâäéèêëíìîïóòôöúùûüç]/i.test(line)) continue;
      push({
        kind: "missing_metric",
        severity: "warning",
        textStart: bm.index,
        textEnd: bm.index + bm[0].length,
        quote: line.slice(0, 80),
        title: "Ajouter un résultat chiffré",
        detail: "Sans métrique (%, €, volumes), l'impact est difficile à scorer.",
        suggestion: `${line.replace(/\.$/, "")} (+18 % / 40 clients)`,
        applyMode: "replace",
        approximate: false,
      });
      metricAnns += 1;
    }
    if (metricAnns === 0) {
      const exp = sectionAnchor(text, "experience") || { textStart: 0, textEnd: Math.min(60, text.length), quote: text.slice(0, 40) };
      push({
        kind: "missing_metric",
        severity: "warning",
        ...exp,
        title: "Enrichir les expériences avec des chiffres",
        detail: "Ajoutez 3 à 5 indicateurs concrets sur vos postes récents.",
        suggestion: "Piloté un portefeuille de 40 clients (+18 % CA)",
        applyMode: "insert_after",
        approximate: true,
      });
    }
  }

  // Gap emploi
  const years = detectDates(text);
  const gap = findEmploymentGap(years);
  if (gap) {
    const yearQuote = String(gap.from);
    const loc = locateQuote(text, yearQuote) || { textStart: 0, textEnd: 4, quote: yearQuote };
    push({
      kind: "gap",
      severity: "critical",
      textStart: loc.textStart,
      textEnd: loc.textEnd,
      quote: loc.quote,
      title: "Justifier le trou d'emploi",
      detail: `Un gap d'environ ${gap.months} mois (${gap.from}–${gap.to}) attire l'attention des recruteurs.`,
      suggestion: `Formation / projet personnel / bénévolat (${gap.from}–${gap.to}) — développer les compétences X`,
      applyMode: "insert_after",
      approximate: true,
    });
  }

  // Mots-clés faibles
  if (scores.keywords.keywords.length < 8) {
    const skills = sectionAnchor(text, "skills");
    const suggested = PROFESSIONAL_KEYWORDS.filter((k) => !text.toLowerCase().includes(k)).slice(0, 8);
    const anchor = skills || { textStart: Math.max(0, text.length - 1), textEnd: text.length, quote: "(compétences)" };
    push({
      kind: "keyword",
      severity: "info",
      textStart: anchor.textStart,
      textEnd: anchor.textEnd,
      quote: anchor.quote,
      title: "Renforcer les mots-clés métier",
      detail: "Densité lexicale faible pour matcher les offres. Ajoutez des termes ciblés.",
      suggestion: suggested.join(", "),
      applyMode: skills ? "insert_after" : "insert_after",
      section: "Compétences",
      approximate: !skills,
    });
  }

  // Longueur
  if (scores.readability.pages > 2) {
    push({
      kind: "length",
      severity: "warning",
      textStart: Math.max(0, text.length - 80),
      textEnd: text.length,
      quote: text.slice(Math.max(0, text.length - 80)).trim() || "(fin du CV)",
      title: "Raccourcir le CV",
      detail: `CV trop long (${scores.readability.pages} pages). Visez 1 à 2 pages.`,
      suggestion: "Condenser les expériences anciennes ; retirer les détails non pertinents.",
      applyMode: "replace",
      approximate: true,
    });
  }

  // LinkedIn
  if (!detectLinkedIn(text) && annotations.filter((a) => a.kind === "missing_email").length < 3) {
    push({
      kind: "missing_email",
      severity: "info",
      textStart: 0,
      textEnd: Math.min(50, text.length),
      quote: text.slice(0, Math.min(50, text.length)).trim(),
      title: "Ajouter un profil LinkedIn",
      detail: "Un lien LinkedIn renforce la crédibilité et facilite le contact RH.",
      suggestion: "linkedin.com/in/prenom-nom",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
    });
  }

  void lang;
  return annotations;
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

    if (pagesGeo?.length && rectsForRange && ann.textStart != null && ann.textEnd != null) {
      const hit = rectsForRange(pagesGeo, ann.textStart, ann.textEnd);
      if (hit.rects.length) {
        page = hit.page;
        rects = hit.rects;
        approximate = false;
      }
    }

    if (!rects.length) {
      if (ann.applyMode === "insert_header" && headerBannerRects) {
        rects = headerBannerRects();
        page = 1;
      } else if ((ann.applyMode === "insert_after" || ann.kind === "missing_section") && footerAnchorRects) {
        rects = footerAnchorRects();
        page = pagesGeo?.length || 1;
      } else {
        // bandeau approximatif autour de l'offset relatif
        const ratio = ann.textStart != null && ann.textEnd != null
          ? ann.textStart / Math.max(1, (ann.textEnd || 1))
          : 0.3;
        // Better: use text position ratio in full doc if we know length
        rects = [{ x: 0.06, y: Math.min(0.85, 0.08 + (ann.textStart || 0) * 0.00015), w: 0.88, h: 0.045 }];
        void ratio;
      }
      approximate = true;
    }

    return { ...ann, page, rects, approximate };
  });
}

function scoreReadability(text, fileMeta) {
  const checks = [];
  let score = 0;
  const len = text.replace(/\s/g, "").length;
  const extractable = len > 80;
  if (extractable) {
    score += 10;
    checks.push({ ok: true, label: "Texte correctement extractible par les ATS." });
  } else {
    checks.push({ ok: false, label: "Texte difficilement extractible — le CV semble scanné ou en image." });
  }

  const pages = estimatePages(text, fileMeta);
  if (pages <= 2) {
    score += 8;
    checks.push({ ok: true, label: pages === 1 ? "Longueur idéale (1 page)." : `Longueur acceptable (${pages} pages).` });
  } else if (pages === 3) {
    score += 4;
    checks.push({ ok: false, label: "CV un peu long (3 pages) — visez 1 à 2 pages." });
  } else {
    checks.push({ ok: false, label: `CV trop long (${pages} pages) — risque de rejet ATS/RH.` });
  }

  const weirdChars = (text.match(/[□�]|[\uFFFD]/g) || []).length;
  const hasColumnsSmell = (text.match(/\t{2,}| {6,}/g) || []).length > 8;
  if (weirdChars === 0 && !hasColumnsSmell) {
    score += 7;
    checks.push({ ok: true, label: "Mise en page linéaire, favorable aux ATS." });
  } else if (weirdChars > 0) {
    score += 2;
    checks.push({ ok: false, label: "Caractères illisibles détectés (encodage ou OCR défaillant)." });
  } else {
    score += 3;
    checks.push({ ok: false, label: "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte." });
  }

  return { score: Math.min(25, score), checks, pages };
}

function scoreStructure(text) {
  const checks = [];
  let score = 0;

  if (detectEmail(text)) {
    score += 5;
    checks.push({ ok: true, label: "Adresse e-mail présente." });
  } else {
    checks.push({ ok: false, label: "Aucune adresse e-mail détectée." });
  }

  if (detectPhone(text)) {
    score += 4;
    checks.push({ ok: true, label: "Numéro de téléphone détecté." });
  } else {
    checks.push({ ok: false, label: "Téléphone manquant ou non reconnu." });
  }

  if (detectLinkedIn(text)) {
    score += 3;
    checks.push({ ok: true, label: "Profil LinkedIn mentionné." });
  } else {
    checks.push({ ok: false, label: "Lien LinkedIn absent." });
  }

  if (JOB_TITLE_HINTS.test(text.slice(0, 800))) {
    score += 5;
    checks.push({ ok: true, label: "Titre/intitulé de poste présent." });
  } else {
    checks.push({ ok: false, label: "Intitulé de poste peu identifiable en tête de CV." });
  }

  if (SECTION_PATTERNS.experience.test(text)) {
    score += 4;
    checks.push({ ok: true, label: "Section Expérience clairement identifiée." });
  } else {
    checks.push({ ok: false, label: "Section Expérience non détectée." });
  }

  if (SECTION_PATTERNS.education.test(text)) {
    score += 2;
    checks.push({ ok: true, label: "Section Formation présente." });
  } else {
    checks.push({ ok: false, label: "Section Formation absente ou mal intitulée." });
  }

  if (SECTION_PATTERNS.skills.test(text)) {
    score += 2;
    checks.push({ ok: true, label: "Section Compétences présente." });
  } else {
    checks.push({ ok: false, label: "Section Compétences manquante." });
  }

  return { score: Math.min(25, score), checks };
}

function scoreContent(text) {
  const checks = [];
  let score = 0;
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const verbHits = ACTION_VERBS.filter((v) => lower.includes(v.toLowerCase())).length;

  if (verbHits >= 6) {
    score += 9;
    checks.push({ ok: true, label: `Verbes d'action bien utilisés (${verbHits}).` });
  } else if (verbHits >= 3) {
    score += 5;
    checks.push({ ok: false, label: `Peu de verbes d'action (${verbHits}) — renforcez l'impact.` });
  } else {
    score += 1;
    checks.push({ ok: false, label: "Verbes d'action quasi absents — reformulez en réalisations." });
  }

  const metrics = (text.match(/\b\d+([.,]\d+)?\s?(%|€|\$|k€|m€|M€)?\b/g) || []).length;
  if (metrics >= 5) {
    score += 9;
    checks.push({ ok: true, label: `Résultats chiffrés présents (${metrics} indicateurs).` });
  } else if (metrics >= 2) {
    score += 5;
    checks.push({ ok: false, label: "Quelques chiffres — ajoutez davantage de métriques." });
  } else {
    checks.push({ ok: false, label: "Presque aucun résultat chiffré — les ATS et RH valorisent les preuves." });
  }

  const wordCount = words.length;
  if (wordCount >= 250 && wordCount <= 900) {
    score += 7;
    checks.push({ ok: true, label: `Concision correcte (~${wordCount} mots).` });
  } else if (wordCount < 250) {
    score += 3;
    checks.push({ ok: false, label: `Contenu trop court (~${wordCount} mots).` });
  } else {
    score += 3;
    checks.push({ ok: false, label: `Contenu dense (~${wordCount} mots) — allégez.` });
  }

  return { score: Math.min(25, score), checks, hasMetrics: metrics >= 2 };
}

function scoreKeywords(text) {
  const checks = [];
  let score = 0;
  const lower = text.toLowerCase();
  const found = PROFESSIONAL_KEYWORDS.filter((k) => lower.includes(k));
  const unique = new Set(found);

  if (unique.size >= 12) {
    score += 15;
    checks.push({ ok: true, label: `Vocabulaire professionnel riche (${unique.size} mots-clés).` });
  } else if (unique.size >= 6) {
    score += 10;
    checks.push({ ok: false, label: `Densité de mots-clés moyenne (${unique.size}).` });
  } else {
    score += 4;
    checks.push({ ok: false, label: "Peu de mots-clés métier — alignez-vous sur les offres cibles." });
  }

  const diversity = unique.size;
  if (diversity >= 8) {
    score += 10;
    checks.push({ ok: true, label: "Bonne diversité lexicale pour matcher les offres." });
  } else {
    score += 4;
    checks.push({ ok: false, label: "Diversifiez le vocabulaire (outils, soft skills, domaines)." });
  }

  return {
    score: Math.min(25, score),
    checks,
    keywords: [...unique].slice(0, 20),
  };
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
  const years = detectDates(text);
  const gap = findEmploymentGap(years);

  if (gap) {
    diagnostics.push({
      severity: "critical",
      title: "Trou d'emploi non justifié",
      body: `Un gap d'environ ${gap.months} mois dans votre parcours attirera immédiatement l'attention. Sans explication, les recruteurs imagineront le pire.`,
      tip: "→ Mentionnez l'activité durant cette période : formation, projet, bénévolat, création d'entreprise.",
    });
  }

  const academicCount = ACADEMIC_MARKERS.filter((m) => text.toLowerCase().includes(m)).length;
  if (academicCount >= 2) {
    diagnostics.push({
      severity: "warning",
      title: "Profil académique non traduit en langage business",
      body: "Votre CV académique ne parle pas spontanément aux recruteurs du secteur privé. Publications et thèse doivent passer au second plan.",
      tip: "→ Reformulez vos recherches en termes d'impact, de budget géré et de résultats applicables à l'industrie.",
    });
  }

  if (!scores.content.hasMetrics) {
    diagnostics.push({
      severity: "warning",
      title: "Manque de résultats chiffrés",
      body: "Sans métriques (%, €, volumes, délais), votre impact est difficile à scorer par un ATS et à juger par un RH.",
      tip: "→ Ajoutez 3 à 5 chiffres concrets par expérience récente.",
    });
  }

  const emailOk = detectEmail(text);
  const phoneOk = detectPhone(text);
  if (!emailOk || !phoneOk) {
    diagnostics.push({
      severity: "critical",
      title: "Coordonnées incomplètes",
      body: "Un ATS et un recruteur doivent pouvoir vous contacter immédiatement. Email et téléphone sont indispensables.",
      tip: "→ Placez email + téléphone en haut du CV, en texte (pas dans une image).",
    });
  }

  if (scores.readability.pages > 2) {
    diagnostics.push({
      severity: "warning",
      title: "CV trop long pour les filtres ATS",
      body: "Au-delà de 2 pages, le signal dilue et certains parseurs tronquent le contenu.",
      tip: "→ Condenser expériences anciennes et retirer les détails non pertinents.",
    });
  }

  const weakVerbs = scores.content.checks.some((c) => !c.ok && c.label.includes("verbe"));
  if (weakVerbs) {
    diagnostics.push({
      severity: "info",
      title: "Formulations passives ou descriptives",
      body: "Les listes de tâches (« responsable de… ») scorent moins bien que des verbes d'action.",
      tip: "→ Remplacez par : piloté, développé, augmenté, réduit, lancé…",
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
 * @param {{ fileName?: string, pages?: number, fileType?: string, lang?: 'fr'|'en' }} fileMeta
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
  const readability = scoreReadability(text, fileMeta);
  const structure = scoreStructure(text);
  const content = scoreContent(text);
  const keywords = scoreKeywords(text);

  const total = readability.score + structure.score + content.score + keywords.score;
  let label = labelForScore(total);
  const tags = buildTags(text, content, structure);
  const diagnostics = buildDiagnostics(text, { readability, structure, content, keywords });
  const spelling = findSpellingIssues(text, detectedLang);
  const annotations = buildAnnotations(
    text,
    { readability, structure, content, keywords },
    spelling,
    detectedLang
  );

  const strengths = [
    ...readability.checks.filter((c) => c.ok).map((c) => ({ category: "Lisibilité ATS", ...c })),
    ...structure.checks.filter((c) => c.ok).map((c) => ({ category: "Structure", ...c })),
    ...content.checks.filter((c) => c.ok).map((c) => ({ category: "Qualité du contenu", ...c })),
    ...keywords.checks.filter((c) => c.ok).map((c) => ({ category: "Mots-clés", ...c })),
  ];

  const blockers = [
    ...readability.checks.filter((c) => !c.ok).map((c) => ({ category: "Lisibilité ATS", ...c })),
    ...structure.checks.filter((c) => !c.ok).map((c) => ({ category: "Structure", ...c })),
    ...content.checks.filter((c) => !c.ok).map((c) => ({ category: "Qualité du contenu", ...c })),
    ...keywords.checks.filter((c) => !c.ok).map((c) => ({ category: "Mots-clés", ...c })),
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
          body: `An unexplained employment gap of about ${months || "—"} months will immediately catch recruiters' attention. Without context, they will assume the worst.`,
          tip:
            "→ Mention what you did during that period: training, project, volunteering, or starting a business.",
        },
        "Profil académique non traduit en langage business": {
          title: "Academic profile not translated into business language",
          body:
            "Your academic profile does not speak naturally to recruiters in the private sector. Publications and your thesis should take a back seat.",
          tip:
            "→ Reframe your research in terms of impact, budget you managed, and results applicable to the industry.",
        },
        "Manque de résultats chiffrés": {
          title: "Missing quantified results",
          body:
            "Without metrics (%, €, volumes, deadlines), your impact is hard for an ATS to score and for HR to evaluate.",
          tip: "→ Add 3 to 5 concrete indicators per recent role.",
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
      const out = { ...ann };

      const mapTitleDetail = (title, detail) => {
        out.title = title;
        out.detail = detail;
      };

      if (ann.kind === "typo") {
        mapTitleDetail("Fix spelling", "“"+ (ann.quote || "") +"” is a frequent typo. Correcting it sends a positive signal.");
      } else if (ann.kind === "missing_email") {
        if ((ann.title || "").toLowerCase().includes("linkedin")) {
          mapTitleDetail(
            "Add a LinkedIn profile",
            "A LinkedIn link improves credibility and helps HR contact you."
          );
          out.section = "Contact details";
          out.suggestion = "linkedin.com/in/first-last";
        } else {
          mapTitleDetail(
            "Add an email address",
            "No email address detected. ATS and recruiters must be able to contact you."
          );
          out.section = "Contact details";
          out.suggestion = String(out.suggestion || "").replace(/prenom\.nom/i, "first.last");
          out.applyMode = out.applyMode || "insert_header";
        }
      } else if (ann.kind === "missing_section") {
        const title = ann.title || "";
        if (title.includes("Expérience")) {
          mapTitleDetail(
            "Add a Professional Experience section",
            "ATS needs clear job history with titles, companies and date ranges."
          );
          out.section = "Document";
          out.suggestion = `\n\nPROFESSIONAL EXPERIENCE\nJob Title — Company (YYYY - YYYY)\n- Led … (+X% / Y clients)\n`;
        } else if (title.includes("Formation")) {
          mapTitleDetail(
            "Add an Education section",
            "Include degree, school, and date range in a simple ATS-friendly block."
          );
          out.section = "Document";
          out.suggestion = `\n\nEDUCATION\nDegree — School (YYYY - YYYY)\n`;
        } else {
          mapTitleDetail(
            "Add a Skills section",
            "List job-relevant tools and competencies using a concise, keyword-friendly format."
          );
          out.section = "Document";
          out.suggestion = `\n\nSKILLS\nProject management, Agile, Excel, reporting, communication, analysis\n`;
        }
      } else if (ann.kind === "passive_verb") {
        mapTitleDetail(
          "Replace passive wording",
          "Passive phrasing sends a weaker ATS signal. Use an action verb + measurable impact."
        );
        out.title = "Replace passive wording";
        out.section = out.section || "Experience";
        out.suggestion = String(out.suggestion || "").replace(/^[Pp]iloté\s+/i, "Led ");
      } else if (ann.kind === "missing_metric") {
        mapTitleDetail(
          "Add measurable results",
          "Without metrics (%, €, volumes, deadlines), it’s hard to quantify impact."
        );
        out.section = out.section || "Experience";
      } else if (ann.kind === "gap") {
        mapTitleDetail(
          "Justify the employment gap",
          "An unexplained employment gap draws immediate attention. Add context so recruiters understand what you did."
        );
        out.section = "Experience";
        // Try to keep year range from detail.
        const m = (ann.detail || "").match(/\((\d+)–(\d+)\)/);
        if (m) {
          out.suggestion = `Training / personal project / volunteering (${m[1]}–${m[2]}) — develop your skills X`;
        }
      } else if (ann.kind === "keyword") {
        mapTitleDetail(
          "Strengthen job-relevant keywords",
          "Your keyword density is low for targeted job postings. Add the most relevant terms."
        );
        out.section = "Skills";
      } else if (ann.kind === "length") {
        mapTitleDetail(
          "Shorten your CV",
          "A too-long CV may be truncated by ATS filters. Aim for 1–2 pages."
        );
        out.section = "Document";
      }
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
  }

  const passes = total >= 70 && readability.score >= 15;

  return {
    fileName: fileMeta.fileName || "CV",
    lang: detectedLang,
    total,
    label,
    passes,
    tags,
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
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    pages: readability.pages,
  };
}

export { labelForScore, buildAnnotations };
