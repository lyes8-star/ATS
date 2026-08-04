/**
 * Prompt IA « CV parfait » — assemble contenu extrait + correctifs d’analyse
 * pour copier-coller dans ChatGPT / Claude / etc. (pas d’appel LLM local).
 */

/**
 * @param {object} session
 * @returns {{ corrections: number, checklistKo: number, hasJd: boolean, chars: number }}
 */
export function promptMeta(session, opts = {}) {
  const anns = actionableAnnotations(session);
  const kos = (session?.report?.checklist || []).filter((c) => c.ok === false);
  const jd =
    session?.jobDescription ||
    session?.report?.jdOverlap?.score != null ||
    session?.report?.jdOverlap?.mustMissing?.length;
  const lang = opts.lang === "en" || opts.lang === "fr" ? opts.lang : detectLang();
  const text = buildAiCvPrompt(session, { lang });
  return {
    corrections: anns.length,
    checklistKo: kos.length,
    hasJd: !!jd,
    chars: text.length,
  };
}

/**
 * @param {object} session
 * @param {{ lang?: 'fr'|'en' }} [opts]
 * @returns {string}
 */
export function buildAiCvPrompt(session, opts = {}) {
  const lang = opts.lang === "en" ? "en" : "fr";
  const report = session?.report || {};
  const parsed = report.parsed || null;
  const jdText = String(session?.jobDescription || "").trim();
  const jd = report.jdOverlap;
  const hasJd = !!(jdText || (jd && (jd.score != null || jd.mustMissing?.length)));
  const L = labels(lang, { hasJd });
  const parts = [];

  parts.push(L.role);
  parts.push("");
  parts.push(`## ${L.constraintsTitle}`);
  parts.push(L.constraintsBody);
  parts.push("");

  // Matching prioritaire quand une offre est présente
  if (hasJd) {
    parts.push(`## ${L.jdTitle}`);
    if (jd && jd.score != null) {
      parts.push(
        L.jdScore
          .replace("{{score}}", String(jd.score))
          .replace("{{must}}", jd.mustCoverage != null ? String(jd.mustCoverage) : "—")
      );
    }
    if (jd?.mustMissing?.length) {
      parts.push(`${L.jdMustMissing}: ${jd.mustMissing.slice(0, 12).join(", ")}`);
    }
    if (jd?.overlap?.length) {
      parts.push(`${L.jdOverlap}: ${jd.overlap.slice(0, 16).join(", ")}`);
    }
    if (jdText) {
      parts.push(`${L.jdOffer}:`);
      parts.push(jdText.slice(0, 4000));
    }
    parts.push("");
  }

  parts.push(`## ${L.sourceTitle}`);
  parts.push(formatSourceCv(parsed, report.text || session?.extracted?.text || "", L));
  parts.push("");

  const anns = actionableAnnotations(session);
  parts.push(`## ${L.correctionsTitle}`);
  if (!anns.length) {
    parts.push(L.correctionsEmpty);
  } else {
    const byAxis = groupBy(anns, (a) => a.axis || "content");
    for (const [axis, list] of Object.entries(byAxis)) {
      parts.push(`### ${axisLabel(axis, L)}`);
      list.forEach((a, i) => {
        parts.push(`${i + 1}. **${clean(a.title) || clean(a.shortLabel) || a.kind}**`);
        if (a.quote) parts.push(`   - ${L.passage}: ${oneLine(a.quote)}`);
        if (a.detail) parts.push(`   - ${L.why}: ${oneLine(a.detail)}`);
        if (a.suggestion) parts.push(`   - ${L.fix}: ${oneLine(a.suggestion)}`);
      });
      parts.push("");
    }
  }

  const kos = (report.checklist || []).filter((c) => c.ok === false);
  parts.push(`## ${L.checklistTitle}`);
  if (!kos.length) {
    parts.push(L.checklistEmpty);
  } else {
    for (const c of kos) {
      parts.push(`- [${c.id || "?"}] ${clean(c.label)}`);
    }
  }
  parts.push("");

  if (report.total != null) {
    parts.push(`## ${L.scoreTitle}`);
    parts.push(
      L.scoreLine
        .replace("{{total}}", String(report.total))
        .replace("{{label}}", report.label?.text || "")
    );
    const cats = report.categories || {};
    for (const key of ["readability", "structure", "content", "keywords"]) {
      const c = cats[key];
      if (!c) continue;
      parts.push(`- ${c.name || key}: ${c.score}/${c.max || 25}`);
    }
    parts.push("");
  }

  parts.push(`## ${L.finalTitle}`);
  parts.push(L.finalBody);

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function actionableAnnotations(session) {
  return (session?.annotations || []).filter((a) => {
    const st = a.status || "pending";
    return st === "pending" || st === "noted" || st === "accepted";
  });
}

/**
 * Signaux diplôme pour secours prompt quand la section Formation n'a pas été parsée.
 */
const DIPLOMA_SIGNAL =
  /\b(master|licence|bachelor|mba|bts|dut|deug|mst|msc|ma[iî]trise|doctorat|phd|bac\s*\+?\s*\d|dipl[ôo]me|école|ecole|university|universit[ée]|iut|grande\s+[ée]cole|ingénieur|engineering\s+degree|cap\b|bep\b)\b/i;

/**
 * Récupère des lignes « diplôme » depuis expérience / other / brut si Formation est vide.
 * @param {object|null} parsed
 * @param {string} rawText
 * @returns {string[]}
 */
export function salvageEducationLines(parsed, rawText = "") {
  const out = [];
  const seen = new Set();
  const push = (line) => {
    const t = String(line || "").trim();
    if (!t || t.length < 4 || t.length > 220) return;
    if (/^[-•●▪–—*]\s+/.test(t) && !DIPLOMA_SIGNAL.test(t)) return;
    if (!DIPLOMA_SIGNAL.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  const pools = [
    ...(parsed?.sections?.experience || []),
    ...(parsed?.sections?.other || []),
    ...(parsed?.sections?.header || []),
    ...(parsed?.sections?.summary || []),
  ];
  for (const line of pools) push(line);

  if (!out.length && rawText) {
    for (const line of String(rawText).split(/\n+/)) push(line);
  }
  return out.slice(0, 8);
}

/**
 * Squelette ATS ordonné : Coordonnées → Profil → Expérience → Formation → Compétences → Langues → Autres.
 * Champs non lus → [À compléter : …] / [To complete: …].
 */
function formatSourceCv(parsed, rawText, L) {
  if (!parsed) {
    const raw = String(rawText || "").trim();
    if (!raw) return L.sourceEmpty;
    return [
      `## ${L.secContact}`,
      L.todoName,
      L.todoEmail,
      L.todoPhone,
      L.todoLinkedin,
      L.todoLocation,
      "",
      `## ${L.secSummary}`,
      L.todoSummary,
      "",
      `## ${L.secExperience}`,
      L.todoSectionExp,
      "",
      `## ${L.secEducation}`,
      L.todoSectionEdu,
      "",
      `## ${L.secSkills}`,
      L.todoSkills,
      "",
      L.rawFallback,
      raw.slice(0, 10000),
    ].join("\n");
  }

  const lines = [];
  const c = parsed.contact || {};
  const name =
    [c.firstName, c.lastName].filter(Boolean).join(" ") || clean(c.name) || "";

  lines.push(`## ${L.secContact}`);
  lines.push(name ? `# ${name}` : L.todoName);
  lines.push(c.email ? `${L.fieldEmail}: ${c.email}` : L.todoEmail);
  lines.push(c.phone ? `${L.fieldPhone}: ${c.phone}` : L.todoPhone);
  lines.push(c.linkedin ? `${L.fieldLinkedin}: ${c.linkedin}` : L.todoLinkedin);
  const loc = c.location || c.address;
  lines.push(loc ? `${L.fieldLocation}: ${loc}` : L.todoLocation);
  lines.push("");

  lines.push(`## ${L.secSummary}`);
  if (parsed.headline) {
    lines.push(parsed.headline);
  } else if (parsed.sections?.summary?.length) {
    for (const line of parsed.sections.summary) lines.push(line);
  } else {
    lines.push(L.todoSummary);
  }
  lines.push("");

  // Experience — reverse chronological
  lines.push(`## ${L.secExperience}`);
  const roles = sortRolesAntiChrono(parsed.roles || []);
  if (!roles.length) {
    lines.push(L.todoSectionExp);
  } else {
    for (const role of roles) {
      lines.push(formatRoleHeading(role, L));
      const bullets = role.bullets || [];
      if (bullets.length) {
        for (const b of bullets) lines.push(`- ${b}`);
      } else {
        lines.push(`- ${L.todoBullets}`);
      }
      lines.push("");
    }
  }
  if (!lines[lines.length - 1]) {
    /* already blank */
  } else {
    lines.push("");
  }

  // Education — reverse chronological
  lines.push(`## ${L.secEducation}`);
  const eduRoles = sortRolesAntiChrono(parsed.educationRoles || []);
  if (!eduRoles.length) {
    // Fallback: raw education section lines if roles not parsed
    const eduLines = parsed.sections?.education || [];
    if (eduLines.length) {
      for (const line of eduLines) lines.push(line);
    } else {
      const salvage = salvageEducationLines(parsed, rawText);
      if (salvage.length) {
        lines.push(L.eduSalvageNote);
        for (const line of salvage) lines.push(line);
      } else {
        lines.push(L.todoSectionEdu);
      }
    }
  } else {
    for (const role of eduRoles) {
      lines.push(formatRoleHeading(role, L));
      for (const b of role.bullets || []) lines.push(`- ${b}`);
      lines.push("");
    }
  }
  if (lines[lines.length - 1] !== "") lines.push("");

  // Skills
  lines.push(`## ${L.secSkills}`);
  if (parsed.skills?.length) {
    lines.push(parsed.skills.join(" · "));
  } else if (parsed.sections?.skills?.length) {
    for (const line of parsed.sections.skills) lines.push(line);
  } else {
    lines.push(L.todoSkills);
  }
  lines.push("");

  // Languages
  lines.push(`## ${L.secLanguages}`);
  const langLines = parsed.sections?.languages || [];
  if (langLines.length) {
    for (const line of langLines) lines.push(line);
  } else {
    lines.push(L.todoLanguages);
  }
  lines.push("");

  // Remaining sections (interests, other…) — keep after standard ATS blocks
  const order = parsed.sectionOrder || Object.keys(parsed.sections || {});
  const skip = new Set(["header", "experience", "education", "skills", "summary", "languages"]);
  for (const key of order) {
    if (skip.has(key)) continue;
    const secLines = parsed.sections?.[key];
    if (!secLines?.length) continue;
    lines.push(`## ${sectionTitle(key, L)}`);
    for (const line of secLines) lines.push(line);
    lines.push("");
  }

  const body = lines.join("\n").trim();
  // Append raw extract when structure is thin (helps the LLM recover missed facts)
  const structuredLen = body.replace(/\[(À compléter|To complete)[^\]]*\]/gi, "").trim().length;
  if (structuredLen < 180 && rawText) {
    return `${body}\n\n${L.rawFallback}\n${String(rawText).trim().slice(0, 10000)}`;
  }
  return body || String(rawText || "").trim().slice(0, 12000) || L.sourceEmpty;
}

function formatRoleHeading(role, L) {
  const title = clean(role.title) || L.todoJobTitle;
  const company = clean(role.company) || L.todoCompany;
  const years = formatYears(role, L);
  const datePart = years || L.todoDates;
  return `### ${title} — ${company} (${datePart})`;
}

/**
 * Dates depuis startYear/endYear/ongoing (parse-cv), avec replis.
 * @param {object} role
 * @param {object} [L]
 */
function formatYears(role, L = null) {
  if (!role) return "";
  const ongoingLabel = L?.ongoing || "aujourd’hui";

  if (role.startYear || role.endYear || role.ongoing) {
    const from = role.startYear || "?";
    const to = role.ongoing ? ongoingLabel : role.endYear || "?";
    if (from === "?" && to === "?") return "";
    return `${from} – ${to}`;
  }

  if (role.years && (role.years.from || role.years.to)) {
    return [role.years.from, role.years.to].filter(Boolean).join(" – ");
  }
  if (role.dateRaw) return String(role.dateRaw);

  // Last resort: try to pull a year range from raw line
  const raw = String(role.raw || "");
  const m = raw.match(/\b(19|20)\d{2}\b.*\b((?:19|20)\d{2}|aujourd['’]?hui|present|en\s+cours|now)\b/i);
  if (m) return m[0].replace(/\s+/g, " ").trim();
  return "";
}

/**
 * Anti-chronologique : plus récent en tête ; ongoing d’abord ; sans date en fin.
 * @param {object[]} roles
 */
function sortRolesAntiChrono(roles) {
  const scored = (roles || []).map((r, i) => ({
    r,
    i,
    end: r.ongoing ? 9999 : Number(r.endYear) || 0,
    start: Number(r.startYear) || 0,
    hasDate: !!(r.startYear || r.endYear || r.ongoing),
  }));
  scored.sort((a, b) => {
    if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
    if (b.end !== a.end) return b.end - a.end;
    if (b.start !== a.start) return b.start - a.start;
    return a.i - b.i;
  });
  return scored.map((x) => x.r);
}

function sectionTitle(key, L) {
  const map = {
    summary: L.secSummary,
    languages: L.secLanguages,
    interests: L.secInterests,
    other: L.secOther,
  };
  return map[key] || key;
}

function axisLabel(axis, L) {
  const map = {
    readability: L.axisReadability,
    structure: L.axisStructure,
    content: L.axisContent,
    keywords: L.axisKeywords,
  };
  return map[axis] || axis;
}

function labels(lang, opts = {}) {
  const hasJd = !!opts.hasJd;
  if (lang === "en") {
    const role = hasJd
      ? "You are an expert ATS resume writer. Adapt my CV to this job offer so it is recruiter-ready and ATS-friendly — without inventing experience."
      : "You are an expert ATS resume writer. Rewrite my CV into a perfect, recruiter-ready, ATS-friendly version.";
    const constraintsExtra = hasJd
      ? [
          "- Prioritize missing must-have terms from the job match section — weave them in only when they are true and credible given my source CV.",
          "- Do not invent tools, certifications, or responsibilities just to match the offer.",
        ]
      : [];
    const finalBody = hasJd
      ? [
          "Rewrite the entire CV tailored to the job offer above.",
          "Output EXACTLY this Markdown section order: Contact → Summary → Experience → Education → Skills → Languages → (optional Other).",
          "Experience and Education must be strictly reverse-chronological WITH start–end dates on every role.",
          "Apply every correction. Integrate missing must-haves only when truthful.",
          "NEVER invent facts. If a field was not read in the source CV, keep it as [To complete: …] in the final CV.",
          "Prefer concrete tools/methods over soft-skill stuffing. Return ONLY the finished Markdown CV.",
        ].join(" ")
      : [
          "Rewrite the entire CV applying every correction above.",
          "Output EXACTLY this Markdown section order: Contact → Summary → Experience → Education → Skills → Languages → (optional Other).",
          "Experience and Education must be strictly reverse-chronological WITH start–end dates on every role.",
          "NEVER invent facts. If a field was not read in the source CV, keep it as [To complete: …] in the final CV.",
          "Prefer concrete tools/methods over soft-skill stuffing. Return ONLY the finished Markdown CV.",
        ].join(" ");
    return {
      role,
      constraintsTitle: "Output constraints",
      constraintsBody: [
        "- Single column only; selectable plain text (no tables, sidebars, multi-column layouts, icons, skill bars, or Canva-style banners).",
        "- EXACT section order in the output CV: Contact → Summary (optional but keep heading) → Experience → Education → Skills → Languages → other only if present.",
        "- Experience AND Education: reverse-chronological (newest first). Every role MUST show dates as (YYYY – YYYY) or (YYYY – Present).",
        "- Each experience bullet starts with a strong action verb and includes a real metric when possible.",
        "- Keep only true facts from my source CV — do not invent jobs, degrees, employers, dates, or numbers.",
        "- If any field is missing / marked [To complete: …] in the source extract, leave the same [To complete: …] placeholder in the final CV — do not drop the section and do not guess.",
        ...constraintsExtra,
        "- Ready to paste into Word / Google Docs, then export as a text PDF.",
        "- Output ONLY the final CV in clean Markdown (headings + bullets). No preamble, no commentary.",
      ].join("\n"),
      sourceTitle: "Source CV (extracted — ATS skeleton)",
      sourceEmpty: "(No structured extract — use corrections and checklist below.)",
      rawFallback: "— Raw extract (recover any missed facts; still do not invent) —",
      correctionsTitle: "Corrections from Test Mon CV analysis (apply all)",
      correctionsEmpty: "(No pending corrections — still optimize for ATS clarity and metrics.)",
      passage: "Passage",
      why: "Why",
      fix: "Suggested fix",
      checklistTitle: "Failed checklist items",
      checklistEmpty: "(No failed checks.)",
      jdTitle: "Target job offer — match first",
      jdScore: "Job↔CV overlap: {{score}}% (must-have coverage {{must}}%)",
      jdMustMissing: "Missing must-have terms (priority)",
      jdOverlap: "Shared terms",
      jdOffer: "Offer text",
      scoreTitle: "Current Test Mon CV score",
      scoreLine: "Score {{total}}/100 — {{label}}",
      finalTitle: "Final instruction",
      finalBody,
      secContact: "Contact",
      secExperience: "Experience",
      secEducation: "Education",
      secSkills: "Skills",
      secSummary: "Summary",
      secLanguages: "Languages",
      secInterests: "Interests",
      secOther: "Other",
      fieldEmail: "Email",
      fieldPhone: "Phone",
      fieldLinkedin: "LinkedIn",
      fieldLocation: "Location",
      ongoing: "Present",
      todoName: "[To complete: full name]",
      todoEmail: "[To complete: email]",
      todoPhone: "[To complete: phone]",
      todoLinkedin: "[To complete: LinkedIn URL]",
      todoLocation: "[To complete: city / location]",
      todoSummary: "[To complete: short professional summary]",
      todoSectionExp: "[To complete: Experience section — title, company, dates, bullets]",
      todoSectionEdu: "[To complete: Education section — degree, school, dates]",
      eduSalvageNote:
        "(Likely education excerpt recovered from other blocks — verify placement; do not invent degrees)",
      todoSkills: "[To complete: skills / tools]",
      todoLanguages: "[To complete: languages]",
      todoJobTitle: "[To complete: job title]",
      todoCompany: "[To complete: company]",
      todoDates: "[To complete: dates YYYY – YYYY]",
      todoBullets: "[To complete: achievement bullets]",
      axisReadability: "ATS readability",
      axisStructure: "Structure",
      axisContent: "Content quality",
      axisKeywords: "Keywords",
    };
  }
  const role = hasJd
    ? "Tu es un expert en rédaction de CV compatibles ATS. Adapte mon CV à cette offre d’emploi pour qu’il soit prêt pour un recruteur et lisible par les logiciels ATS — sans inventer d’expérience."
    : "Tu es un expert en rédaction de CV compatibles ATS. Réécris mon CV en version parfaite, prête pour un recruteur et lisible par les logiciels ATS.";
  const constraintsExtra = hasJd
    ? [
        "- Priorise les termes must absents de la section matching — intègre-les uniquement s’ils sont vrais et crédibles au regard de mon CV source.",
        "- N’invente ni outil, ni certification, ni responsabilité juste pour matcher l’offre.",
      ]
    : [];
  const finalBody = hasJd
    ? [
        "Réécris le CV intégralement en l’adaptant à l’offre ci-dessus.",
        "Respecte EXACTEMENT cet ordre Markdown : Coordonnées → Profil → Expérience → Formation → Compétences → Langues → (Autres si pertinent).",
        "Expérience et Formation doivent être strictement anti-chronologiques AVEC dates début–fin sur chaque entrée.",
        "Applique toutes les corrections. Intègre les must absents uniquement s’ils sont vrais.",
        "N’INVENTE JAMAIS. Si une info n’a pas été lue dans le CV source, laisse [À compléter : …] dans le CV final.",
        "Privilégie outils/méthodes concrets. Renvoie UNIQUEMENT le CV Markdown final.",
      ].join(" ")
    : [
        "Réécris le CV intégralement en appliquant toutes les corrections.",
        "Respecte EXACTEMENT cet ordre Markdown : Coordonnées → Profil → Expérience → Formation → Compétences → Langues → (Autres si pertinent).",
        "Expérience et Formation doivent être strictement anti-chronologiques AVEC dates début–fin sur chaque entrée.",
        "N’INVENTE JAMAIS. Si une info n’a pas été lue dans le CV source, laisse [À compléter : …] dans le CV final.",
        "Privilégie outils/méthodes concrets. Renvoie UNIQUEMENT le CV Markdown final.",
      ].join(" ");
  return {
    role,
    constraintsTitle: "Contraintes de sortie",
    constraintsBody: [
      "- Une seule colonne ; texte sélectionnable (pas de tableaux, colonnes, sidebar, icônes, barres de compétences, ni bandeaux type Canva).",
      "- Ordre EXACT des sections du CV final : Coordonnées → Profil (conserver le titre même si court) → Expérience → Formation → Compétences → Langues → autres seulement si présents.",
      "- Expérience ET Formation : anti-chronologique (plus récent en premier). Chaque entrée DOIT afficher des dates (AAAA – AAAA) ou (AAAA – aujourd’hui).",
      "- Chaque puce d’expérience commence par un verbe d’action fort et inclut un chiffre réel quand c’est possible.",
      "- Ne garde que des faits vrais issus de mon CV source — n’invente ni poste, ni diplôme, ni employeur, ni dates, ni métrique.",
      "- Si un champ est manquant / marqué [À compléter : …] dans l’extrait source, conserve le même placeholder [À compléter : …] dans le CV final — ne supprime pas la section et ne devine pas.",
      ...constraintsExtra,
      "- Prêt à coller dans Word / Google Docs, puis export PDF texte.",
      "- Sortie UNIQUEMENT le CV final en Markdown clair (titres + puces). Aucune intro, aucun commentaire.",
    ].join("\n"),
    sourceTitle: "CV source (extrait — squelette ATS)",
    sourceEmpty: "(Pas d’extrait structuré — utilise les corrections et la checklist ci-dessous.)",
    rawFallback: "— Extrait brut (récupère les faits manqués ; n’invente toujours rien) —",
    correctionsTitle: "Corrections issues de l’analyse Test Mon CV (à appliquer toutes)",
    correctionsEmpty: "(Aucune correction en attente — optimise quand même clarté ATS et métriques.)",
    passage: "Passage",
    why: "Pourquoi",
    fix: "Correction proposée",
    checklistTitle: "Contrôles en échec",
    checklistEmpty: "(Aucun contrôle en échec.)",
    jdTitle: "Offre d’emploi cible — matching prioritaire",
    jdScore: "Alignement offre↔CV : {{score}} % (couverture must {{must}} %)",
    jdMustMissing: "Termes must absents (priorité)",
    jdOverlap: "Termes communs",
    jdOffer: "Texte de l’offre",
    scoreTitle: "Score Test Mon CV actuel",
    scoreLine: "Score {{total}}/100 — {{label}}",
    finalTitle: "Consigne finale",
    finalBody,
    secContact: "Coordonnées",
    secExperience: "Expérience",
    secEducation: "Formation",
    secSkills: "Compétences",
    secSummary: "Profil",
    secLanguages: "Langues",
    secInterests: "Centres d’intérêt",
    secOther: "Autre",
    fieldEmail: "E-mail",
    fieldPhone: "Téléphone",
    fieldLinkedin: "LinkedIn",
    fieldLocation: "Localisation",
    ongoing: "aujourd’hui",
    todoName: "[À compléter : prénom et nom]",
    todoEmail: "[À compléter : e-mail]",
    todoPhone: "[À compléter : téléphone]",
    todoLinkedin: "[À compléter : URL LinkedIn]",
    todoLocation: "[À compléter : ville / localisation]",
    todoSummary: "[À compléter : profil professionnel court]",
    todoSectionExp: "[À compléter : section Expérience — intitulé, entreprise, dates, puces]",
    todoSectionEdu: "[À compléter : section Formation — diplôme, école, dates]",
    eduSalvageNote:
      "(Extrait Formation probable récupéré ailleurs — vérifiez le classement ; n’inventez pas de diplômes)",
    todoSkills: "[À compléter : compétences / outils]",
    todoLanguages: "[À compléter : langues]",
    todoJobTitle: "[À compléter : intitulé de poste]",
    todoCompany: "[À compléter : entreprise]",
    todoDates: "[À compléter : dates AAAA – AAAA]",
    todoBullets: "[À compléter : puces de réalisations]",
    axisReadability: "Lisibilité ATS",
    axisStructure: "Structure",
    axisContent: "Qualité du contenu",
    axisKeywords: "Mots-clés",
  };
}

function detectLang() {
  try {
    if (typeof globalThis.window !== "undefined" && globalThis.window.ATSi18n?.getLang?.() === "en") {
      return "en";
    }
  } catch (_) {
    /* Node / no i18n */
  }
  return "fr";
}

function groupBy(arr, keyFn) {
  /** @type {Record<string, object[]>} */
  const out = {};
  for (const item of arr) {
    const k = keyFn(item) || "other";
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function oneLine(s) {
  return clean(s).slice(0, 500);
}

/** @internal exported for unit tests */
export { formatYears, sortRolesAntiChrono, formatSourceCv };
