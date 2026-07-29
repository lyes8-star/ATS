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
  const L = labels(lang);
  const report = session?.report || {};
  const parsed = report.parsed || null;
  const parts = [];

  parts.push(L.role);
  parts.push("");
  parts.push(`## ${L.constraintsTitle}`);
  parts.push(L.constraintsBody);
  parts.push("");

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

  const jdText = String(session?.jobDescription || "").trim();
  const jd = report.jdOverlap;
  if (jdText || (jd && jd.score != null)) {
    parts.push(`## ${L.jdTitle}`);
    if (jd && jd.score != null) {
      parts.push(
        L.jdScore
          .replace("{{score}}", String(jd.score))
          .replace("{{must}}", jd.mustCoverage != null ? String(jd.mustCoverage) : "—")
      );
      if (jd.mustMissing?.length) {
        parts.push(`${L.jdMustMissing}: ${jd.mustMissing.slice(0, 12).join(", ")}`);
      }
      if (jd.overlap?.length) {
        parts.push(`${L.jdOverlap}: ${jd.overlap.slice(0, 16).join(", ")}`);
      }
    }
    if (jdText) {
      parts.push(`${L.jdOffer}:`);
      parts.push(jdText.slice(0, 4000));
    }
    parts.push("");
  }

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

function formatSourceCv(parsed, rawText, L) {
  if (!parsed) {
    const raw = String(rawText || "").trim();
    return raw ? raw.slice(0, 12000) : L.sourceEmpty;
  }

  const lines = [];
  const c = parsed.contact || {};
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "";
  if (name) lines.push(`# ${name}`);
  if (parsed.headline) lines.push(parsed.headline);

  const contactBits = [c.email, c.phone, c.linkedin, c.location || c.address].filter(Boolean);
  if (contactBits.length) lines.push(contactBits.join(" · "));
  lines.push("");

  // Prefer structured roles when available
  if (parsed.roles?.length) {
    lines.push(`## ${L.secExperience}`);
    for (const role of parsed.roles) {
      const head = [role.title, role.company].filter(Boolean).join(" — ");
      const years = formatYears(role);
      lines.push(`### ${head}${years ? ` (${years})` : ""}`);
      for (const b of role.bullets || []) {
        lines.push(`- ${b}`);
      }
      lines.push("");
    }
  }

  if (parsed.educationRoles?.length) {
    lines.push(`## ${L.secEducation}`);
    for (const role of parsed.educationRoles) {
      const head = [role.title, role.company].filter(Boolean).join(" — ");
      const years = formatYears(role);
      lines.push(`### ${head}${years ? ` (${years})` : ""}`);
      for (const b of role.bullets || []) lines.push(`- ${b}`);
      lines.push("");
    }
  }

  if (parsed.skills?.length) {
    lines.push(`## ${L.secSkills}`);
    lines.push(parsed.skills.join(" · "));
    lines.push("");
  }

  // Remaining section lines not already covered
  const order = parsed.sectionOrder || Object.keys(parsed.sections || {});
  const skip = new Set(["header", "experience", "education", "skills"]);
  for (const key of order) {
    if (skip.has(key)) continue;
    const secLines = parsed.sections?.[key];
    if (!secLines?.length) continue;
    lines.push(`## ${sectionTitle(key, L)}`);
    for (const line of secLines) lines.push(line);
    lines.push("");
  }

  // If structure was thin, append raw extract (truncated)
  const body = lines.join("\n").trim();
  if (body.length < 120 && rawText) {
    return `${body}\n\n${L.rawFallback}\n${String(rawText).trim().slice(0, 10000)}`;
  }
  return body || String(rawText || "").trim().slice(0, 12000) || L.sourceEmpty;
}

function formatYears(role) {
  if (role?.years && (role.years.from || role.years.to)) {
    return [role.years.from, role.years.to].filter(Boolean).join(" – ");
  }
  if (role?.dateRaw) return String(role.dateRaw);
  return "";
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

function labels(lang) {
  if (lang === "en") {
    return {
      role:
        "You are an expert ATS resume writer. Rewrite my CV into a perfect, recruiter-ready, ATS-friendly version.",
      constraintsTitle: "Output constraints",
      constraintsBody: [
        "- Single column only; selectable plain text (no tables, sidebars, multi-column layouts, icons, skill bars, or Canva-style banners).",
        "- Standard headings: Contact, Summary (optional), Experience, Education, Skills (and Languages if relevant).",
        "- Reverse-chronological experience; each bullet starts with a strong action verb and includes a real metric when possible.",
        "- Keep only true facts from my source CV — do not invent jobs, degrees, employers, or numbers.",
        "- Ready to paste into Word / Google Docs, then export as a text PDF.",
        "- Output ONLY the final CV in clean Markdown (headings + bullets). No preamble, no commentary.",
      ].join("\n"),
      sourceTitle: "Source CV (extracted)",
      sourceEmpty: "(No structured extract — use corrections and checklist below.)",
      rawFallback: "— Raw extract —",
      correctionsTitle: "Corrections from Test Mon CV analysis (apply all)",
      correctionsEmpty: "(No pending corrections — still optimize for ATS clarity and metrics.)",
      passage: "Passage",
      why: "Why",
      fix: "Suggested fix",
      checklistTitle: "Failed checklist items",
      checklistEmpty: "(No failed checks.)",
      jdTitle: "Target job description",
      jdScore: "Job↔CV overlap: {{score}}% (must-have coverage {{must}}%)",
      jdMustMissing: "Missing must-have terms",
      jdOverlap: "Shared terms",
      jdOffer: "Offer text",
      scoreTitle: "Current Test Mon CV score",
      scoreLine: "Score {{total}}/100 — {{label}}",
      finalTitle: "Final instruction",
      finalBody:
        "Rewrite the entire CV applying every correction above. Preserve true facts only. Prefer concrete tools/methods over soft-skill stuffing. Return only the finished Markdown CV.",
      secExperience: "Experience",
      secEducation: "Education",
      secSkills: "Skills",
      secSummary: "Summary",
      secLanguages: "Languages",
      secInterests: "Interests",
      secOther: "Other",
      axisReadability: "ATS readability",
      axisStructure: "Structure",
      axisContent: "Content quality",
      axisKeywords: "Keywords",
    };
  }
  return {
    role:
      "Tu es un expert en rédaction de CV compatibles ATS. Réécris mon CV en version parfaite, prête pour un recruteur et lisible par les logiciels ATS.",
    constraintsTitle: "Contraintes de sortie",
    constraintsBody: [
      "- Une seule colonne ; texte sélectionnable (pas de tableaux, colonnes, sidebar, icônes, barres de compétences, ni bandeaux type Canva).",
      "- Titres standards : Coordonnées, Profil (optionnel), Expérience, Formation, Compétences (et Langues si pertinent).",
      "- Expériences en anti-chronologique ; chaque puce commence par un verbe d’action fort et inclut un chiffre réel quand c’est possible.",
      "- Ne garde que des faits vrais issus de mon CV source — n’invente ni poste, ni diplôme, ni employeur, ni métrique.",
      "- Prêt à coller dans Word / Google Docs, puis export PDF texte.",
      "- Sortie UNIQUEMENT le CV final en Markdown clair (titres + puces). Aucune intro, aucun commentaire.",
    ].join("\n"),
    sourceTitle: "CV source (extrait)",
    sourceEmpty: "(Pas d’extrait structuré — utilise les corrections et la checklist ci-dessous.)",
    rawFallback: "— Extrait brut —",
    correctionsTitle: "Corrections issues de l’analyse Test Mon CV (à appliquer toutes)",
    correctionsEmpty: "(Aucune correction en attente — optimise quand même clarté ATS et métriques.)",
    passage: "Passage",
    why: "Pourquoi",
    fix: "Correction proposée",
    checklistTitle: "Contrôles en échec",
    checklistEmpty: "(Aucun contrôle en échec.)",
    jdTitle: "Offre d’emploi cible",
    jdScore: "Alignement offre↔CV : {{score}} % (couverture must {{must}} %)",
    jdMustMissing: "Termes must absents",
    jdOverlap: "Termes communs",
    jdOffer: "Texte de l’offre",
    scoreTitle: "Score Test Mon CV actuel",
    scoreLine: "Score {{total}}/100 — {{label}}",
    finalTitle: "Consigne finale",
    finalBody:
      "Réécris le CV intégralement en appliquant toutes les corrections. Conserve uniquement les faits vrais. Privilégie outils/méthodes concrets plutôt que le stuffing soft skills. Renvoie uniquement le CV Markdown final.",
    secExperience: "Expérience",
    secEducation: "Formation",
    secSkills: "Compétences",
    secSummary: "Profil",
    secLanguages: "Langues",
    secInterests: "Centres d’intérêt",
    secOther: "Autre",
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
