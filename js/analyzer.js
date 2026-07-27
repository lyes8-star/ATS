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
    const words = text.match(/[A-Za-zÀ-ü]{5,}/g) || [];
    for (const w of words) {
      const low = w.toLowerCase();
      if (seen.has(low)) continue;
      if (whitelist?.has(low)) continue;
      if (/^\d/.test(w) || /[A-Z]{2,}/.test(w)) continue; // acronyms / codes
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
      if (issues.length >= 12) break;
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
 * Titres / details / suggestions concrets — pas de faux chiffres ni phrases bateau.
 * Les rects PDF sont enrichis plus tard via attachGeometry().
 */
function buildAnnotations(text, scores, spelling, lang) {
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

  for (const s of spelling) {
    const ctx = (s.context || "").replace(/\s+/g, " ").trim();
    push({
      kind: "typo",
      axis: "content",
      shortLabel: isEn ? "Spelling" : "Orthographe",
      severity: "critical",
      textStart: s.textStart,
      textEnd: s.textEnd,
      quote: s.wrong,
      title: isEn
        ? `Fix « ${s.wrong} » → « ${s.right} »`
        : `Corriger « ${s.wrong} » → « ${s.right} »`,
      detail: ctx
        ? (isEn ? `Found here: ${ctx}` : `Repéré ici : ${ctx}`)
        : (isEn ? "Replace this misspelling on your CV." : "Remplacez cette faute telle qu'elle apparaît sur votre CV."),
      suggestion: s.right,
      applyMode: "replace",
      approximate: false,
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
    if (!SECTION_PATTERNS[ms.key].test(text)) {
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
      });
    }
  }

  const passiveRe = /\bresponsable\s+de\s+[^.!\n]{8,120}/gi;
  let pm;
  let passiveCount = 0;
  while ((pm = passiveRe.exec(text)) !== null && passiveCount < 6) {
    const quote = pm[0].trim();
    const suggestion = quote
      .replace(/^responsable\s+de\s+/i, isEn ? "Led " : "Piloté ")
      .replace(/^./, (c) => c.toUpperCase());
    push({
      kind: "passive_verb",
      axis: "content",
      shortLabel: isEn ? "Verb" : "Verbe",
      severity: "warning",
      textStart: pm.index,
      textEnd: pm.index + pm[0].length,
      quote,
      title: isEn
        ? `Replace « ${quote.slice(0, 42)}${quote.length > 42 ? "…" : ""} »`
        : `Remplacer « ${quote.slice(0, 42)}${quote.length > 42 ? "…" : ""} »`,
      detail: isEn
        ? "This line describes a duty, not an action. Swap to a strong verb on the same task."
        : "Cette ligne décrit une tâche, pas une action. Remplacez par un verbe d'action sur la même mission.",
      suggestion,
      applyMode: "replace",
      approximate: false,
    });
    passiveCount += 1;
  }

  if (!scores.content.hasMetrics) {
    const bulletRe = /^[\s•\-\*]+(.{20,160})$/gm;
    let bm;
    let metricAnns = 0;
    while ((bm = bulletRe.exec(text)) !== null && metricAnns < 4) {
      const line = bm[1].trim();
      if (/\d/.test(line)) continue;
      if (!/[a-záàâäéèêëíìîïóòôöúùûüç]/i.test(line)) continue;
      const suggestion = `${line.replace(/\.$/, "")} [${
        isEn ? "metric: % or volume you owned" : "chiffre : % ou volume dont vous êtes responsable"
      }]`;
      push({
        kind: "missing_metric",
        axis: "content",
        shortLabel: isEn ? "Metric" : "Chiffre",
        severity: "warning",
        textStart: bm.index,
        textEnd: bm.index + bm[0].length,
        quote: line.slice(0, 100),
        title: isEn ? "Add a metric to this bullet" : "Ajouter un chiffre à cette puce",
        detail: isEn
          ? "This bullet has no number. Replace the bracket with a real KPI from that role (%, €, headcount, delay)."
          : "Cette puce n'a aucun chiffre. Remplacez le crochet par un vrai KPI de ce poste (%, €, effectif, délai).",
        suggestion,
        applyMode: "replace",
        approximate: false,
      });
      metricAnns += 1;
    }
    if (metricAnns === 0) {
      const exp =
        sectionAnchor(text, "experience") || {
          textStart: 0,
          textEnd: Math.min(60, text.length),
          quote: text.slice(0, 40),
        };
      push({
        kind: "missing_metric",
        axis: "content",
        shortLabel: isEn ? "Metric" : "Chiffre",
        severity: "warning",
        ...exp,
        title: isEn ? "Add quantified results to recent roles" : "Chiffrer les expériences récentes",
        detail: isEn
          ? "No metrics detected on the CV. Pick 2–3 recent bullets and add a real KPI you can defend in interview."
          : "Aucun chiffre détecté sur le CV. Choisissez 2–3 puces récentes et ajoutez un KPI réel que vous pouvez défendre en entretien.",
        suggestion: isEn
          ? "- [Action] … ([metric: % / volume / €])"
          : "- [Action] … ([chiffre : % / volume / €])",
        applyMode: "insert_after",
        approximate: true,
      });
    }
  }

  const empGaps = scores.structure?.employmentGaps || [];
  const gap =
    empGaps[0] ||
    (() => {
      const years = detectDates(text);
      return findEmploymentGap(years);
    })();
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
    });
  }

  if (
    scores.keywords.keywords.length < 8 ||
    (scores.keywords.jdOverlap && scores.keywords.jdOverlap.score < 50)
  ) {
    const skills = sectionAnchor(text, "skills");
    const jd = scores.keywords.jdOverlap;
    let terms = [];
    if (jd?.jdTerms?.length) {
      terms = jd.jdTerms
        .filter((t) => !text.toLowerCase().includes(String(t).toLowerCase()))
        .slice(0, 5);
    }
    if (!terms.length) {
      terms = PROFESSIONAL_KEYWORDS.filter((k) => !text.toLowerCase().includes(k)).slice(0, 5);
    }
    if (terms.length) {
      const anchor =
        skills || {
          textStart: Math.max(0, text.length - 1),
          textEnd: text.length,
          quote: "(compétences)",
        };
      const line = terms.join(" · ");
      push({
        kind: "keyword",
        axis: "keywords",
        shortLabel: isEn ? "Keywords" : "Mots-clés",
        severity: "info",
        textStart: anchor.textStart,
        textEnd: anchor.textEnd,
        quote: anchor.quote,
        title: isEn
          ? `Add missing skills: ${terms.slice(0, 3).join(", ")}`
          : `Ajouter les compétences manquantes : ${terms.slice(0, 3).join(", ")}`,
        detail:
          jd?.score != null
            ? isEn
              ? `Job↔CV overlap is ${jd.score}%. Only keep terms you actually master.`
              : `Alignement offre↔CV à ${jd.score} %. Ne gardez que les termes que vous maîtrisez vraiment.`
            : isEn
              ? "These terms are weak or missing vs. typical target roles. Append only those you use."
              : "Ces termes sont absents ou faibles par rapport aux offres types. N'ajoutez que ceux que vous utilisez.",
        suggestion: isEn ? `Skills: ${line}` : `Compétences : ${line}`,
        applyMode: "insert_after",
        section: "Compétences",
        approximate: !skills,
      });
    }
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
      suggestion: tail,
      applyMode: "replace",
      approximate: true,
    });
  }

  if (!detectLinkedIn(text)) {
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
        ? "Edit the placeholder with your real profile slug, then accept to insert it in the header."
        : "Remplacez le placeholder par le slug de votre vrai profil, puis acceptez pour l'insérer en tête.",
      suggestion: "[linkedin.com/in/votre-profil]",
      applyMode: "insert_header",
      section: "Coordonnées",
      approximate: true,
    });
  }

  if (scores.readability.hasColumnsSmell || scores.readability.hasTables) {
    push({
      kind: "layout",
      axis: "readability",
      shortLabel: isEn ? "Layout" : "Mise en page",
      severity: "warning",
      textStart: 0,
      textEnd: Math.min(30, text.length),
      quote: text.slice(0, Math.min(30, text.length)).trim() || "(document)",
      title: isEn
        ? "Layout may confuse ATS (columns/tables)"
        : "Mise en page risquée pour les ATS (colonnes/tableaux)",
      detail: isEn
        ? "We detected column or table signals. Prefer a linear export for ATS applications."
        : "Colonnes ou tableaux détectés. Préférez un export linéaire pour les candidatures ATS.",
      suggestion: "",
      applyMode: "replace",
      approximate: true,
    });
  }

  return annotations;
}

function shortLabelFor(kind) {
  const map = {
    typo: "Orthographe",
    missing_email: "Email",
    missing_phone: "Téléphone",
    missing_linkedin: "LinkedIn",
    missing_section: "Section",
    passive_verb: "Verbe",
    missing_metric: "Chiffre",
    gap: "Gap",
    keyword: "Mots-clés",
    length: "Longueur",
    layout: "Mise en page",
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
  const layout = fileMeta.parsed?.layout;
  // Prefer geometry-based column detection; fall back to whitespace heuristic (stricter threshold)
  const hasColumnsSmell = layout
    ? !!layout.columnSmell
    : (text.match(/\t{2,}| {8,}/g) || []).length > 12;
  const hasTables = !!(layout?.tableHint || (fileMeta.tableCount || 0) > 0);

  if (weirdChars === 0 && !hasColumnsSmell && !hasTables) {
    score += 7;
    checks.push({ ok: true, label: "Mise en page linéaire, favorable aux ATS." });
  } else if (weirdChars > 0) {
    score += 2;
    checks.push({ ok: false, label: "Caractères illisibles détectés (encodage ou OCR défaillant)." });
  } else if (hasTables) {
    score += 3;
    checks.push({ ok: false, label: "Tableaux détectés — certains ATS mélangent l'ordre des cellules." });
  } else {
    score += 3;
    checks.push({ ok: false, label: "Indices de colonnes/tableaux — certains ATS mélangent l'ordre du texte." });
  }

  return { score: Math.min(25, score), checks, pages, hasColumnsSmell, hasTables };
}

function scoreStructure(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const parsed = fileMeta.parsed;
  const contact = parsed?.contact;

  if (contact?.email || detectEmail(text)) {
    score += 5;
    checks.push({ ok: true, label: "Adresse e-mail présente." });
  } else {
    checks.push({ ok: false, label: "Aucune adresse e-mail détectée." });
  }

  if (contact?.phone || detectPhone(text)) {
    score += 4;
    checks.push({ ok: true, label: "Numéro de téléphone détecté." });
  } else {
    checks.push({ ok: false, label: "Téléphone manquant ou non reconnu." });
  }

  if (contact?.linkedin || detectLinkedIn(text)) {
    score += 3;
    checks.push({ ok: true, label: "Profil LinkedIn mentionné." });
  } else {
    checks.push({ ok: false, label: "Lien LinkedIn absent." });
  }

  const hasTitle =
    (parsed?.roles?.[0]?.title && parsed.roles[0].title.length > 2) ||
    JOB_TITLE_HINTS.test(text.slice(0, 800));
  if (hasTitle) {
    score += 5;
    checks.push({ ok: true, label: "Titre/intitulé de poste présent." });
  } else {
    checks.push({ ok: false, label: "Intitulé de poste peu identifiable en tête de CV." });
  }

  const hasExp =
    (parsed?.sections?.experience?.length > 0) || SECTION_PATTERNS.experience.test(text);
  if (hasExp) {
    score += 4;
    checks.push({ ok: true, label: "Section Expérience clairement identifiée." });
  } else {
    checks.push({ ok: false, label: "Section Expérience non détectée." });
  }

  const hasEdu =
    (parsed?.sections?.education?.length > 0) || SECTION_PATTERNS.education.test(text);
  if (hasEdu) {
    score += 2;
    checks.push({ ok: true, label: "Section Formation présente." });
  } else {
    checks.push({ ok: false, label: "Section Formation absente ou mal intitulée." });
  }

  const hasSkills =
    (parsed?.sections?.skills?.length > 0) || SECTION_PATTERNS.skills.test(text);
  if (hasSkills) {
    score += 2;
    checks.push({ ok: true, label: "Section Compétences présente." });
  } else {
    checks.push({ ok: false, label: "Section Compétences manquante." });
  }

  return {
    score: Math.min(25, score),
    checks,
    roleCount: parsed?.roles?.length || 0,
    employmentGaps: parsed?.employmentGaps || [],
  };
}

function scoreContent(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const words = text.split(/\s+/).filter(Boolean);
  const verbInfo = fileMeta.verbStats;
  const verbHits = verbInfo
    ? verbInfo.strong
    : ACTION_VERBS.filter((v) => text.toLowerCase().includes(v.toLowerCase())).length;
  const weakHits = verbInfo?.weak || 0;

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

  if (weakHits >= 3) {
    score = Math.max(0, score - 2);
    checks.push({
      ok: false,
      label: `Formulations faibles détectées (${weakHits}) — préférez des verbes d'action.`,
    });
  }

  // Metrics per bullet when roles available
  const roles = fileMeta.parsed?.roles || [];
  let bullets = 0;
  let bulletsWithMetrics = 0;
  if (roles.length) {
    for (const r of roles) {
      for (const b of r.bullets || []) {
        bullets += 1;
        if (/\d/.test(b)) bulletsWithMetrics += 1;
      }
    }
  }
  const metrics = (text.match(/\b\d+([.,]\d+)?\s?(%|€|\$|k€|m€|M€)?\b/g) || []).length;
  if (bullets >= 3) {
    const ratio = bulletsWithMetrics / bullets;
    if (ratio >= 0.4) {
      score += 9;
      checks.push({
        ok: true,
        label: `Résultats chiffrés présents (${bulletsWithMetrics}/${bullets} puces).`,
      });
    } else if (ratio >= 0.15) {
      score += 5;
      checks.push({ ok: false, label: "Quelques chiffres — ajoutez davantage de métriques." });
    } else {
      checks.push({
        ok: false,
        label: "Presque aucun résultat chiffré — les ATS et RH valorisent les preuves.",
      });
    }
  } else if (metrics >= 5) {
    score += 9;
    checks.push({ ok: true, label: `Résultats chiffrés présents (${metrics} indicateurs).` });
  } else if (metrics >= 2) {
    score += 5;
    checks.push({ ok: false, label: "Quelques chiffres — ajoutez davantage de métriques." });
  } else {
    checks.push({
      ok: false,
      label: "Presque aucun résultat chiffré — les ATS et RH valorisent les preuves.",
    });
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

  return {
    score: Math.min(25, score),
    checks,
    hasMetrics: metrics >= 2 || bulletsWithMetrics >= 2,
    weakHits,
  };
}

function scoreKeywords(text, fileMeta = {}) {
  const checks = [];
  let score = 0;
  const skillsMatch = fileMeta.skillsMatch;
  const lower = text.toLowerCase();
  const found = skillsMatch?.hits?.length
    ? skillsMatch.hits
    : PROFESSIONAL_KEYWORDS.filter((k) => lower.includes(k));
  const unique = new Set(found);

  if (unique.size >= 12) {
    score += 12;
    checks.push({ ok: true, label: `Vocabulaire professionnel riche (${unique.size} mots-clés).` });
  } else if (unique.size >= 6) {
    score += 8;
    checks.push({ ok: false, label: `Densité de mots-clés moyenne (${unique.size}).` });
  } else {
    score += 3;
    checks.push({ ok: false, label: "Peu de mots-clés métier — alignez-vous sur les offres cibles." });
  }

  const diversity = unique.size;
  if (diversity >= 8) {
    score += 8;
    checks.push({ ok: true, label: "Bonne diversité lexicale pour matcher les offres." });
  } else {
    score += 3;
    checks.push({ ok: false, label: "Diversifiez le vocabulaire (outils, soft skills, domaines)." });
  }

  // JD overlap bonus / penalty
  const jd = fileMeta.jdOverlap;
  if (jd && jd.score != null) {
    if (jd.score >= 50) {
      score += 5;
      checks.push({
        ok: true,
        label: `Alignement offre ↔ CV : ${jd.score}% (${jd.overlap.length} termes communs).`,
      });
    } else {
      score += 1;
      checks.push({
        ok: false,
        label: `Faible alignement avec l'offre (${jd.score}%) — reprenez les termes clés.`,
      });
    }
  }

  return {
    score: Math.min(25, score),
    checks,
    keywords: [...unique].slice(0, 24),
    jdOverlap: jd || null,
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
  // Prefer employment-only gaps from structured parse
  const empGaps = scores.structure?.employmentGaps || [];
  if (empGaps.length) {
    const gap = empGaps[0];
    diagnostics.push({
      severity: gap.months >= 24 ? "warning" : "info",
      title: "Trou d'emploi non justifié",
      body: `Un écart d'environ ${gap.months} mois entre deux expériences (${gap.from}–${gap.to}) peut interroger. Expliquez-le brièvement si pertinent.`,
      tip: "→ Mentionnez l'activité durant cette période : formation, projet, bénévolat, création d'entreprise.",
    });
  }

  const academicCount = ACADEMIC_MARKERS.filter((m) => text.toLowerCase().includes(m)).length;
  // Soft signal only — not a penalty without a target JD
  if (academicCount >= 3 && !scores.keywords?.jdOverlap) {
    diagnostics.push({
      severity: "info",
      title: "Profil académique — adapter le langage si besoin",
      body: "Si vous ciblez le privé, reformulez publications/thèse en impact et résultats applicables.",
      tip: "→ Mettez en avant budgets, livrables, collaborations et résultats mesurables.",
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

  if (scores.readability.hasColumnsSmell || scores.readability.hasTables) {
    diagnostics.push({
      severity: "warning",
      title: "Mise en page potentiellement hostile ATS",
      body: "Colonnes ou tableaux peuvent faire lire le texte dans le désordre par certains robots.",
      tip: "→ Préférez une lecture linéaire ; gardez le design si vous exportez aussi une version ATS linéaire.",
    });
  }

  const weakVerbs = scores.content.checks.some((c) => !c.ok && /verbe|faible/i.test(c.label));
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
  const readability = scoreReadability(text, fileMeta);
  const structure = scoreStructure(text, fileMeta);
  const content = scoreContent(text, fileMeta);
  const keywords = scoreKeywords(text, fileMeta);

  const total = readability.score + structure.score + content.score + keywords.score;
  let label = labelForScore(total);
  const tags = buildTags(text, content, structure);
  const diagnostics = buildDiagnostics(text, { readability, structure, content, keywords });
  const spelling =
    fileMeta.spelling ||
    findSpellingIssues(text, detectedLang, fileMeta.techWhitelist || null);
  const annotations = buildAnnotations(
    text,
    { readability, structure, content, keywords },
    spelling,
    uiLang
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
        "Tableaux détectés — certains ATS mélangent l'ordre des cellules.":
          "Tables detected — some ATS mix cell reading order.",
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

      m = s.match(/^Alignement offre ↔ CV : (\d+)% \((\d+) termes communs\)\.$/);
      if (m) return `Job ↔ CV alignment: ${m[1]}% (${m[2]} shared terms).`;

      m = s.match(/^Faible alignement avec l'offre \((\d+)%\) — reprenez les termes clés\.$/);
      if (m) return `Weak job alignment (${m[1]}%) — reuse key terms.`;

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
          tip: "→ Prefer linear reading order; keep the design if you also export a linear ATS version.",
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
    parsed: fileMeta.parsed || null,
    skillsMatch: fileMeta.skillsMatch || null,
    jdOverlap: fileMeta.jdOverlap || keywords.jdOverlap || null,
    layoutHostile: !!(readability.hasColumnsSmell || readability.hasTables),
  };
}

/**
 * Async analyze: structured parse + lazy lexicons + optional JD overlap + spelling whitelist.
 * @param {string} rawText
 * @param {object} [fileMeta]
 * @param {{ jobDescription?: string }} [opts]
 */
export async function analyzeCvAsync(rawText, fileMeta = {}, opts = {}) {
  const { parseCv } = await import("./parse-cv.js");
  const {
    preloadAnalysisData,
    matchSkills,
    matchJdOverlap,
    countVerbs,
    loadTechWhitelist,
  } = await import("./skills-match.js");

  await preloadAnalysisData();
  let techWhitelist = null;
  try {
    techWhitelist = await loadTechWhitelist();
  } catch {
    techWhitelist = null;
  }

  const parsed = parseCv(rawText, {
    pagesGeo: fileMeta.pagesGeo || null,
    tableCount: fileMeta.tableCount || 0,
  });
  const detectedLang = detectLanguage(normalizeText(rawText));
  const [skillsMatch, verbStats] = await Promise.all([
    matchSkills(rawText),
    countVerbs(rawText, detectedLang === "en" ? "en" : "fr"),
  ]);

  let jdOverlap = null;
  const jd = (opts.jobDescription || fileMeta.jobDescription || "").trim();
  if (jd) {
    jdOverlap = await matchJdOverlap(rawText, jd);
  }

  let spelling = findSpellingIssues(normalizeText(rawText), detectedLang, techWhitelist);
  spelling = await enrichSpellingWithNspell(
    normalizeText(rawText),
    detectedLang,
    spelling,
    techWhitelist
  );

  return analyzeCv(rawText, {
    ...fileMeta,
    parsed,
    skillsMatch,
    verbStats,
    jdOverlap,
    techWhitelist,
    spelling,
  });
}

export { labelForScore, buildAnnotations, findSpellingIssues };
