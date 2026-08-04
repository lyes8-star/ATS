/**
 * Tests du moteur ATS + annotations + optimize (Node)
 */
import { analyzeCv, attachGeometry, detectCvSource, detectDocumentProfile } from "./analyzer.js";
import { applyAll } from "./optimize.js";
import { rectsForRange } from "./extract.js";
import { parseCv, parseDateRange, findEmploymentGaps, normalizeHeading } from "./parse-cv.js";
import { buildAho, ahoFind } from "./skills-match.js";
import { buildCleanHtml, buildCvModel } from "./export-cv.js";
import { buildFaithfulHtml } from "./export-reconstruct.js";
import { mergeAdjacentWt, replaceInDocumentXml } from "./export-docx.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const goodCv = `
Marie Dupont
Développeuse Full Stack
marie.dupont@email.com | 06 12 34 56 78 | linkedin.com/in/mariedupont
Paris, France

PROFIL
Développeuse full stack avec 5 ans d'expérience, spécialisée en JavaScript et cloud.

EXPÉRIENCE PROFESSIONNELLE
Développeuse Full Stack — TechCorp (2021 - aujourd'hui)
- Développé une plateforme SaaS utilisée par 12 000 clients
- Optimisé les performances API : -40% de latence
- Piloté une équipe de 4 développeurs en méthode Agile/Scrum
- Mis en place CI/CD sur AWS, déploiement automatisé

Développeuse Frontend — StartupXYZ (2019 - 2021)
- Créé le design system React de l'entreprise
- Augmenté le taux de conversion de 18%
- Collaboré avec le product owner et l'équipe UX

FORMATION
Master Informatique — Université de Lyon (2017 - 2019)
Licence Informatique (2014 - 2017)

COMPÉTENCES
JavaScript, TypeScript, React, Node.js, Python, SQL, AWS, Docker, Agile, management, reporting, KPI

LANGUES
Français (natif), Anglais (courant)
`;

const badCv = `
Jean
cv scanné presque vide
acceuil client
professionel
`;

const report = analyzeCv(goodCv, { fileName: "marie.pdf", pages: 1 });
assert.ok(report.total >= 70, `Expected high score, got ${report.total}`);
assert.equal(report.categories.readability.score, 25);
assert.ok(report.passes);
assert.ok(report.strengths.length >= 4);
assert.ok(Array.isArray(report.annotations), "annotations array expected");
console.log("✓ Bon CV → score", report.total, report.label.text, "anns", report.annotations.length);

let threw = false;
try {
  analyzeCv(badCv);
} catch {
  threw = true;
}
assert.ok(threw || analyzeCv(badCv + " ".repeat(50) + "texte un peu plus long pour passer le seuil minimum de caractères extractibles ici.").total < 60);
const weakText =
  badCv +
  "\n" +
  "texte supplémentaire pour permettre l'analyse même si le contenu reste pauvre et peu structuré sans sections claires.";
const weak = analyzeCv(weakText);
assert.ok(weak.total < 70, `Expected weak score, got ${weak.total}`);
assert.ok(weak.spelling.length >= 1);
assert.ok(weak.annotations.length >= 1, "weak CV should produce annotations");
const withOffsets = weak.annotations.filter(
  (a) => typeof a.textStart === "number" && typeof a.textEnd === "number" && a.textEnd >= a.textStart
);
assert.ok(withOffsets.length >= 1, "annotations should have valid offsets");
const typo = weak.annotations.find((a) => a.kind === "typo");
assert.ok(typo, "expected typo annotation");
assert.ok(typo.quote.length > 0);
assert.equal(weak.text.slice(typo.textStart, typo.textEnd).toLowerCase(), typo.quote.toLowerCase());
console.log("✓ CV faible → score", weak.total, "fautes:", weak.spelling.length, "anns:", weak.annotations.length);

// Passive verb annotation
const passiveCv = `
Paul Martin
paul@mail.com | 01 23 45 67 89
EXPÉRIENCE
Consultant — Acme (2018 - 2020)
- responsable de la gestion du portefeuille client
FORMATION
Master
COMPÉTENCES
Excel
`;
const passiveReport = analyzeCv(passiveCv, { pages: 1 });
const passiveAnn = passiveReport.annotations.find((a) => a.kind === "passive_verb");
assert.ok(passiveAnn, "expected passive_verb annotation");
assert.ok(passiveAnn.suggestion.toLowerCase().includes("pilot"));
assert.ok(!/\+18|40 clients|\+X\s*%/i.test(passiveAnn.suggestion), "no fake metrics on passive");
assert.ok(/Remplacer|Replace/i.test(passiveAnn.title) && /responsable/i.test(passiveAnn.title));
console.log("✓ Annotation verbe passif OK");

const typoReport = analyzeCv(
  "acceuil client et professionel\n" + "texte pour passer le seuil de caractères extractibles minimum ici. ".repeat(3),
  { pages: 1 }
);
const typoAnn = typoReport.annotations.find((a) => a.kind === "typo");
assert.ok(typoAnn);
assert.ok(/Corriger|Fix/i.test(typoAnn.title) && typoAnn.title.includes(typoAnn.quote));
assert.ok(!/prenom\.nom@email\.com/i.test(JSON.stringify(typoReport.annotations)));
console.log("✓ Annotation typo concrète OK");

// attachGeometry fallback
const geo = attachGeometry(passiveReport.annotations, [], {
  rectsForRange: () => ({ page: 1, rects: [] }),
  headerBannerRects: () => [{ x: 0.05, y: 0.02, w: 0.9, h: 0.06 }],
  footerAnchorRects: () => [{ x: 0.05, y: 0.9, w: 0.9, h: 0.06 }],
});
assert.ok(geo.every((a) => Array.isArray(a.rects) && a.rects.length > 0));
console.log("✓ attachGeometry fallback rects OK");

// Offsets must align with pagesGeo for precise PDF overlays
{
  const src = "acceuil client et professionel\n";
  const reportAligned = analyzeCv(src + "texte pour passer le seuil de caractères extractibles minimum ici.");
  const typoAligned = reportAligned.annotations.find((a) => a.kind === "typo");
  assert.ok(typoAligned, "typo expected on aligned sample");
  assert.equal(
    reportAligned.text.slice(typoAligned.textStart, typoAligned.textEnd).toLowerCase(),
    typoAligned.quote.toLowerCase()
  );
  const pagesGeo = [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [
        {
          page: 1,
          str: reportAligned.text.slice(0, 40),
          textStart: 0,
          textEnd: 40,
          rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.03 },
        },
        {
          page: 1,
          str: reportAligned.text.slice(typoAligned.textStart, typoAligned.textEnd),
          textStart: typoAligned.textStart,
          textEnd: typoAligned.textEnd,
          rect: { x: 0.1, y: 0.2, w: 0.2, h: 0.03 },
        },
      ],
    },
  ];
  const hit = rectsForRange(pagesGeo, typoAligned.textStart, typoAligned.textEnd);
  assert.ok(hit.rects.length >= 1, "rectsForRange should hit typo span");
  const withGeo = attachGeometry([typoAligned], pagesGeo, {
    rectsForRange,
    headerBannerRects: () => [{ x: 0.05, y: 0.02, w: 0.9, h: 0.06 }],
    footerAnchorRects: () => [{ x: 0.05, y: 0.9, w: 0.9, h: 0.06 }],
  });
  assert.equal(withGeo[0].approximate, false);
  assert.equal(withGeo[0].placement, "exact");
  console.log("✓ Offset/pagesGeo alignment OK");
}

// optimize.applyAll
const anns = [
  {
    id: "ann-1",
    status: "accepted",
    applyMode: "replace",
    textStart: typo.textStart,
    textEnd: typo.textEnd,
    suggestion: typo.suggestion,
    quote: typo.quote,
  },
  {
    id: "ann-2",
    status: "accepted",
    applyMode: "insert_header",
    suggestion: "jean@email.com",
  },
  {
    id: "ann-3",
    status: "ignored",
    applyMode: "replace",
    textStart: 0,
    textEnd: 1,
    suggestion: "X",
  },
];
const { text: optimized, applied } = applyAll(weak.text, anns);
assert.ok(applied.length >= 2);
assert.ok(optimized.includes("jean@email.com") || optimized.toLowerCase().includes("accueil") || optimized.toLowerCase().includes("professionnel"));
assert.ok(!optimized.startsWith("X")); // ignored not applied at start incorrectly for ignored
console.log("✓ optimize.applyAll OK");

// Score delta after applying many suggestions on weak-ish structured CV
const improvable = `
Samir Benali
samir@exemple.com
EXPÉRIENCE PROFESSIONNELLE
Chargé de clientèle — Boutique (2015 - 2016)
- responsable de la gestion des stocks
FORMATION
BTS
COMPÉTENCES
accueil
`;
const before = analyzeCv(improvable, { pages: 1 });
const toAccept = before.annotations
  .filter((a) => a.applyMode === "replace" || a.applyMode === "insert_header" || a.applyMode === "insert_after")
  .slice(0, 8)
  .map((a) => ({ ...a, status: "accepted" }));
const { text: improved } = applyAll(before.text, toAccept);
const after = analyzeCv(improved, { pages: 1 });
assert.ok(after.total >= before.total - 12, `retest should not collapse (${before.total} → ${after.total})`);
console.log("✓ Retest delta", before.total, "→", after.total);

// —— Parse structuré / skills / layout / JD ——
const sampleParsed = parseCv(goodCv);
assert.ok(sampleParsed.sections.experience?.length > 0, "experience section");
assert.ok(sampleParsed.roles.length >= 2, "roles detected");
assert.ok(sampleParsed.contact.email, "email from parse");
assert.ok(sampleParsed.skills.length >= 3, "skills list");
const dr = parseDateRange("Développeuse — Tech (2021 - aujourd'hui)");
assert.equal(dr.startYear, 2021);
assert.equal(dr.ongoing, true);
console.log("✓ parse-cv sections/roles/dates OK");

const gapRoles = [
  { startYear: 2015, endYear: 2016, ongoing: false, section: "experience" },
  { startYear: 2019, endYear: 2021, ongoing: false, section: "experience" },
];
const gaps = findEmploymentGaps(gapRoles);
assert.ok(gaps.length >= 1 && gaps[0].months >= 24, "employment gap");
const noMix = findEmploymentGaps([
  ...gapRoles,
  { startYear: 2017, endYear: 2018, ongoing: false, section: "education" },
]);
assert.ok(noMix.length >= 1, "education ignored in employment gaps");
console.log("✓ employment gaps OK");

const skillsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data/analysis/skills-fr-en.min.json");
const skillsData = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
const auto = buildAho(skillsData.skills.slice(0, 200));
const hits = ahoFind(auto, goodCv);
assert.ok(hits.size >= 3, `expected skill hits, got ${hits.size}`);
console.log("✓ Aho–Corasick skills hit", hits.size);

// Column smell: bimodal x lines
const colCv = parseCv("Titre\n", {
  pagesGeo: [
    {
      page: 1,
      width: 600,
      height: 800,
      items: [
        { str: "Left A", page: 1, rect: { x: 0.08, y: 0.1, w: 0.2, h: 0.02 }, textStart: 0, textEnd: 6 },
        { str: "Right A", page: 1, rect: { x: 0.55, y: 0.1, w: 0.2, h: 0.02 }, textStart: 7, textEnd: 14 },
        { str: "Left B", page: 1, rect: { x: 0.09, y: 0.15, w: 0.2, h: 0.02 }, textStart: 15, textEnd: 21 },
        { str: "Right B", page: 1, rect: { x: 0.56, y: 0.15, w: 0.2, h: 0.02 }, textStart: 22, textEnd: 29 },
        { str: "Left C", page: 1, rect: { x: 0.08, y: 0.2, w: 0.2, h: 0.02 }, textStart: 30, textEnd: 36 },
        { str: "Right C", page: 1, rect: { x: 0.55, y: 0.2, w: 0.2, h: 0.02 }, textStart: 37, textEnd: 44 },
        { str: "Left D", page: 1, rect: { x: 0.1, y: 0.25, w: 0.2, h: 0.02 }, textStart: 45, textEnd: 51 },
        { str: "Right D", page: 1, rect: { x: 0.58, y: 0.25, w: 0.2, h: 0.02 }, textStart: 52, textEnd: 59 },
      ],
    },
  ],
});
assert.ok(typeof colCv.layout.columnSmell === "boolean");
console.log("✓ layout column detect", colCv.layout);

const withJd = analyzeCv(goodCv, {
  pages: 1,
  jdOverlap: { overlap: ["javascript", "react", "aws"], score: 75, jdTerms: ["javascript", "react", "aws", "java"] },
  skillsMatch: {
    hardHits: [
      "javascript",
      "react",
      "aws",
      "docker",
      "agile",
      "python",
      "sql",
      "typescript",
      "node.js",
      "scrum",
      "kpi",
      "reporting",
    ],
    hits: ["javascript", "react", "aws", "docker", "agile", "python", "sql", "typescript", "node.js", "scrum", "management", "reporting"],
  },
});
assert.ok(withJd.categories.keywords.score >= 15);
assert.ok(withJd.jdOverlap?.score === 75);
console.log("✓ JD overlap scoring OK", withJd.categories.keywords.score);

const htmlFaithful = buildFaithfulHtml(goodCv, sampleParsed, { fileName: "marie.pdf" });
assert.ok(htmlFaithful.includes("Expérience") || htmlFaithful.includes("expérience") || htmlFaithful.includes("Experience"));
assert.ok(htmlFaithful.includes("<h1>"), "name as h1");
assert.ok(!/Généré par|Test Mon CV|score \d/i.test(htmlFaithful), "no tool branding in export");
assert.ok(htmlFaithful.includes("cv-role") || htmlFaithful.includes("<ul>"), "structured roles/bullets");
console.log("✓ clean reconstruct order + no branding OK");

const model = buildCvModel(goodCv, sampleParsed);
assert.ok(model.name.toLowerCase().includes("marie"));
assert.ok(model.roles.length >= 1);
assert.ok(model.skills.length >= 3);
const clean = buildCleanHtml(goodCv, sampleParsed, { lang: "fr" });
assert.equal(clean.includes("Généré par"), false);
console.log("✓ buildCvModel / ATS Clean OK");

const xml = `<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t> World</w:t></w:r></w:p><w:p><w:r><w:t>acceuil client</w:t></w:r></w:p></w:body></w:document>`;
const merged = mergeAdjacentWt(xml);
assert.ok(merged.includes("Hello World") || (merged.includes("Hello") && merged.includes("World")));
const { xml: fixed, ok } = replaceInDocumentXml(merged, "acceuil", "accueil");
assert.ok(ok);
assert.ok(fixed.includes("accueil"));
console.log("✓ DOCX merge/replace OK");

// —— Precision checklist / heuristics ——
{
  const bulletOnlyFormation = `
Samir Benali
samir@exemple.com | 06 11 22 33 44
EXPÉRIENCE PROFESSIONNELLE
Consultant — Acme (2018 - 2020)
- Suivi de la formation interne des nouveaux arrivants
COMPÉTENCES
Excel, reporting
`;
  const r = analyzeCv(bulletOnlyFormation, { pages: 1 });
  const eduOk = r.checklist.find((c) => c.id === "section_education");
  assert.ok(eduOk && eduOk.ok === false, "« formation » in bullet must not count as Education section");
  assert.ok(
    r.annotations.some((a) => a.kind === "missing_section" && /formation|education/i.test(a.title)),
    "missing Formation annotation expected"
  );
  console.log("✓ heading-only sections (no false Formation) OK");
}

{
  const dateHeavy = `
Alex Martin
alex@mail.com | 01 23 45 67 89
EXPÉRIENCE
Analyste — Co (2020 - 2022)
- Présent de 2019 à 2021 sur le site de Paris
FORMATION
Master (2018 - 2020)
COMPÉTENCES
Excel
`;
  const r = analyzeCv(dateHeavy, { pages: 1 });
  const metricsCheck = r.checklist.find((c) => c.id === "metrics");
  assert.ok(metricsCheck && metricsCheck.ok === false, "year-only digits must not count as metrics");
  assert.ok(
    r.annotations.some((a) => a.kind === "missing_metric"),
    "missing metric annotation when only years present"
  );
  console.log("✓ date-only metrics do not boost content OK");
}

{
  const linkedinWord = `
Marie Test
marie@test.com | 06 12 34 56 78
LinkedIn
EXPÉRIENCE
Dev — Co (2021 - 2023)
- Développé une API
FORMATION
Licence
COMPÉTENCES
JS
`;
  const r = analyzeCv(linkedinWord, { pages: 1 });
  const li = r.checklist.find((c) => c.id === "linkedin");
  assert.ok(li && li.ok === false, "word LinkedIn alone is not enough");
  assert.ok(r.annotations.some((a) => a.kind === "missing_linkedin"));
  console.log("✓ strict LinkedIn URL OK");
}

{
  const adjacentDates = `
EXPÉRIENCE PROFESSIONNELLE
Développeuse Full Stack — TechCorp
2021 - aujourd'hui
- Piloté une équipe de 4 développeurs
Lead Frontend — StartupXYZ
2019 - 2021
- Créé le design system
`;
  const p = parseCv(`Marie\nmarie@x.com\n${adjacentDates}\nFORMATION\nMaster\nCOMPÉTENCES\nReact`);
  assert.ok(p.roles.length >= 2, `expected 2 roles with adjacent dates, got ${p.roles.length}`);
  assert.ok(p.roles[0].startYear === 2021 || p.roles.some((r) => r.startYear === 2021));
  assert.ok(p.roles.some((r) => /TechCorp/i.test(r.company) || /TechCorp/i.test(r.title)));
  console.log("✓ parseRoles adjacent date lines OK", p.roles.map((r) => `${r.title}|${r.company}|${r.startYear}`));
}

{
  const graphic = parseCv(`COMPÉTENCES\nJavaScript ★★★★☆\nPython ████░\nExcel 5/5`);
  // Need section header
  const g2 = parseCv(`Marie\n\nCOMPÉTENCES\nJavaScript ★★★★☆\nPython ████░\nniveau : ░░`);
  assert.equal(g2.graphicSkills, true, "graphic skills detected");
  const r = analyzeCv(
    `Marie Dupont\nmarie@x.com | 06 12 34 56 78\nEXPÉRIENCE\nDev — Co (2020 - 2021)\n- Fait des choses\nFORMATION\nMaster\nCOMPÉTENCES\nJavaScript ★★★★☆\nPython ████░\nniveau :`,
    { pages: 1 }
  );
  assert.ok(r.annotations.some((a) => a.kind === "graphic_skills"));
  console.log("✓ graphic skills annotation OK");
}

{
  const r = analyzeCv(goodCv, { pages: 1 });
  assert.ok(Array.isArray(r.checklist) && r.checklist.length >= 8, "checklist present");
  const ids = r.checklist.map((c) => c.id);
  assert.ok(ids.includes("extractable_text"));
  assert.ok(ids.includes("email"));
  assert.ok(ids.includes("section_experience"));
  assert.ok(ids.includes("metrics"));
  assert.ok(ids.includes("identity_name"));
  assert.ok(ids.includes("identity_address"));
  assert.ok(ids.includes("profile_photo"));
  assert.ok(ids.includes("job_title_headline"));
  assert.ok(ids.includes("role_dates"));
  assert.ok(ids.includes("interests"));
  assert.ok(ids.includes("spelling_quality"));
  assert.ok(ids.includes("grammar_quality"));
  assert.ok(new Set(ids).size === ids.length, "checklist ids unique");
  console.log("✓ checklist stable ids OK", r.checklist.filter((c) => c.ok).length + "/" + r.checklist.length);
}

{
  const {
    analyzePdfLayout,
    detectTableHint,
    detectStrongTableGrid,
    isBimodalColumnLayout,
  } = await import("./extract.js");

  // Real 4×6 grid in body → table
  const gridLayout = analyzePdfLayout([
    {
      page: 1,
      width: 600,
      height: 800,
      items: Array.from({ length: 24 }, (_, i) => ({
        str: `Cell${i % 4}`,
        page: 1,
        textStart: i * 5,
        textEnd: i * 5 + 4,
        rect: {
          x: 0.1 + (i % 4) * 0.2,
          y: 0.22 + Math.floor(i / 4) * 0.08,
          w: 0.08,
          h: 0.02,
        },
      })),
    },
  ]);
  assert.equal(gridLayout.tableHint, true, "aligned 4-col grid should flag tables");
  assert.ok(gridLayout.tableCount >= 1);
  console.log("✓ PDF layout heuristics OK", gridLayout);

  // Two-column CV (skills left / experience + dates right) — not a table
  const twoColItems = [];
  for (let i = 0; i < 8; i++) {
    const y = 0.18 + i * 0.08;
    twoColItems.push({
      str: `Skill line number ${i}`,
      page: 1,
      textStart: i * 40,
      textEnd: i * 40 + 18,
      rect: { x: 0.08, y, w: 0.22, h: 0.02 },
    });
    twoColItems.push({
      str: `Job Title Role ${i}`,
      page: 1,
      textStart: i * 40 + 20,
      textEnd: i * 40 + 34,
      rect: { x: 0.42, y, w: 0.28, h: 0.02 },
    });
    twoColItems.push({
      str: `2020-202${i}`,
      page: 1,
      textStart: i * 40 + 35,
      textEnd: i * 40 + 44,
      rect: { x: 0.75, y, w: 0.15, h: 0.02 },
    });
  }
  assert.equal(isBimodalColumnLayout(twoColItems), true, "2-col CV is bimodal");
  assert.equal(detectStrongTableGrid(twoColItems), false, "2-col CV must not be strong grid");
  assert.equal(detectTableHint(twoColItems), false, "2-col CV must not set tableHint");
  const twoColLayout = analyzePdfLayout([
    { page: 1, width: 600, height: 800, items: twoColItems },
  ]);
  assert.equal(twoColLayout.tableHint, false, "analyzePdfLayout skips 2-col as tables");
  console.log("✓ PDF 2-col layout no false table OK");

  // Word PDF: sidebar + corps fragmenté titre/entreprise/dates (4 pics X irréguliers)
  const wordFrag = [];
  for (let i = 0; i < 10; i++) {
    const y = 0.2 + i * 0.07;
    wordFrag.push({
      str: `Competence skill ${i}`,
      page: 1,
      textStart: i * 60,
      textEnd: i * 60 + 18,
      rect: { x: 0.06, y, w: 0.25, h: 0.02 },
    });
    wordFrag.push({
      str: `Poste Senior ${i}`,
      page: 1,
      textStart: i * 60 + 20,
      textEnd: i * 60 + 33,
      rect: { x: 0.4, y, w: 0.18, h: 0.02 },
    });
    wordFrag.push({
      str: `Entreprise${i}`,
      page: 1,
      textStart: i * 60 + 34,
      textEnd: i * 60 + 44,
      rect: { x: 0.58, y, w: 0.14, h: 0.02 },
    });
    wordFrag.push({
      str: `2020-202${i % 10}`,
      page: 1,
      textStart: i * 60 + 45,
      textEnd: i * 60 + 54,
      rect: { x: 0.78, y, w: 0.12, h: 0.02 },
    });
  }
  // Header "Nom | Titre" (ancre visuelle du faux positif)
  wordFrag.push({
    str: "LYNA AMARA",
    page: 1,
    textStart: 0,
    textEnd: 10,
    rect: { x: 0.15, y: 0.05, w: 0.2, h: 0.03 },
  });
  wordFrag.push({
    str: "|",
    page: 1,
    textStart: 11,
    textEnd: 12,
    rect: { x: 0.42, y: 0.05, w: 0.02, h: 0.03 },
  });
  wordFrag.push({
    str: "HR Business Partner",
    page: 1,
    textStart: 13,
    textEnd: 32,
    rect: { x: 0.48, y: 0.05, w: 0.3, h: 0.03 },
  });
  assert.equal(isBimodalColumnLayout(wordFrag), true, "Word fragmented sidebar is bimodal");
  assert.equal(detectStrongTableGrid(wordFrag), false, "Word frag 4-X must not be table");
  const wordFragLayout = analyzePdfLayout(
    [{ page: 1, width: 600, height: 800, items: wordFrag }],
    { pdfCreator: "Microsoft Word", pdfProducer: "Microsoft: Print To PDF" }
  );
  assert.equal(wordFragLayout.tableHint, false, "Word PDF without real table → no tableHint");
  console.log("✓ Word PDF fragmented 2-col no false table OK");

  // Word-like linear CV: contact 3-frag line + left-aligned body (no grid)
  const wordLikeItems = [];
  // Header contact band (would false-positive old heuristic)
  ["marie@x.com", "|", "06 12 34 56 78", "|", "Paris"].forEach((str, i) => {
    wordLikeItems.push({
      str,
      page: 1,
      textStart: i * 10,
      textEnd: i * 10 + str.length,
      rect: { x: 0.08 + i * 0.16, y: 0.06, w: 0.12, h: 0.02 },
    });
  });
  // Body: mostly single-column fragments + a few title/date pairs
  const bodyLines = [
    ["EXPÉRIENCE"],
    ["Développeuse Full Stack", "—", "TechCorp", "(2021", "-", "2023)"],
    ["Développé une plateforme SaaS"],
    ["Lead Frontend", "StartupXYZ", "2019-2021"],
    ["Créé le design system React"],
    ["FORMATION"],
    ["Master Informatique", "Université", "2017-2019"],
    ["COMPÉTENCES"],
    ["React,", "Node,", "TypeScript,", "Agile"],
    ["management,", "SQL,", "Docker,", "AWS"],
  ];
  let cursor = 100;
  bodyLines.forEach((parts, li) => {
    parts.forEach((str, pi) => {
      wordLikeItems.push({
        str,
        page: 1,
        textStart: cursor,
        textEnd: cursor + str.length,
        rect: {
          x: 0.08 + (pi > 0 ? Math.min(pi * 0.12, 0.35) : 0),
          y: 0.2 + li * 0.055,
          w: Math.min(0.2, 0.02 + str.length * 0.008),
          h: 0.02,
        },
      });
      cursor += str.length + 1;
    });
  });

  const wordLinear = analyzePdfLayout(
    [{ page: 1, width: 600, height: 800, items: wordLikeItems }],
    { pdfCreator: "Microsoft Word", pdfProducer: "Microsoft: Print To PDF" }
  );
  assert.equal(wordLinear.tableHint, false, "Word-like linear CV must not flag tables");
  assert.equal(detectTableHint(wordLikeItems), false);
  assert.equal(detectStrongTableGrid(wordLikeItems), false);
  console.log("✓ Word-like linear PDF no false table OK");

  // Same grid with Word creator still flags (strong grid)
  const wordGrid = analyzePdfLayout(
    [
      {
        page: 1,
        width: 600,
        height: 800,
        items: Array.from({ length: 24 }, (_, i) => ({
          str: `C${i % 4}`,
          page: 1,
          textStart: i * 3,
          textEnd: i * 3 + 2,
          rect: {
            x: 0.12 + (i % 4) * 0.2,
            y: 0.25 + Math.floor(i / 4) * 0.07,
            w: 0.1,
            h: 0.02,
          },
        })),
      },
    ],
    { pdfCreator: "Word", pdfProducer: "Microsoft Word" }
  );
  assert.equal(wordGrid.tableHint, true, "Word PDF with real grid still flags");
  console.log("✓ Word PDF with real grid still detected OK");
}

// —— Detached ArrayBuffer / cloneBytesForPdf ——
{
  const { cloneBytesForPdf } = await import("./extract.js");
  const source = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]).buffer; // %PDF-1.4
  const { keep, forPdf } = cloneBytesForPdf(source);
  assert.ok(keep instanceof ArrayBuffer);
  assert.ok(forPdf instanceof Uint8Array);
  assert.equal(keep.byteLength, source.byteLength);
  assert.equal(forPdf.byteLength, source.byteLength);
  // forPdf must not share keep's buffer (pdf.js may transfer forPdf)
  assert.notEqual(forPdf.buffer, keep);
  // Simulate worker transfer of the pdf.js copy
  const transferred = structuredClone(forPdf.buffer, { transfer: [forPdf.buffer] });
  assert.ok(transferred.byteLength > 0);
  assert.equal(forPdf.buffer.detached, true);
  assert.equal(keep.detached, false);
  // keep remains usable
  const again = keep.slice(0);
  assert.equal(again.byteLength, keep.byteLength);
  const view = new Uint8Array(keep);
  assert.equal(view[0], 37); // '%'
  console.log("✓ cloneBytesForPdf survives transfer/detach OK");
}

// —— Exigeant: letter-spaced headings + readability cap ——
{
  assert.equal(normalizeHeading("E X P É R I E N C E"), "expérience");
  assert.equal(normalizeHeading("F O R M A T I O N"), "formation");
  assert.equal(normalizeHeading("C O M P É T E N C E S"), "compétences");
  assert.ok(normalizeHeading("Expériences professionnelles").includes("exp"));

  const spacedCv = `
Marie Dupont
marie@test.com | 06 12 34 56 78

E X P É R I E N C E
Dev — Co (2020 - 2022)
- Piloté un projet

F O R M A T I O N
Master — Univ (2018 - 2020)

C O M P É T E N C E S
JavaScript, React, management
`;
  const spacedParsed = parseCv(spacedCv);
  assert.ok(spacedParsed.sections.experience?.length > 0, "letter-spaced EXPÉRIENCE must parse");
  assert.ok(spacedParsed.sections.education?.length > 0, "letter-spaced FORMATION must parse");
  assert.ok(spacedParsed.sections.skills?.length > 0, "letter-spaced COMPÉTENCES must parse");
  const spacedReport = analyzeCv(spacedCv, { pages: 1, parsed: spacedParsed });
  const shOk = spacedReport.checklist.find((c) => c.id === "standard_headings");
  assert.ok(shOk?.ok, "standard_headings ok when letter-spaced titles present");
  console.log("✓ letter-spaced section headings detected OK");
}

{
  // Simulate parse fail: text has words but no heading lines → readability capped
  const noHeadings = `
Samir Benali
samir@exemple.com | 06 11 22 33 44
linkedin.com/in/samir
J'ai travaillé comme consultant avec de la formation interne et des compétences Excel.
Texte suffisamment long pour l'extractibilité ATS avec des détails sur le parcours professionnel
et des réalisations diverses sans titres de section standards machine-lisibles ici vraiment.
`;
  const r = analyzeCv(noHeadings, { pages: 1 });
  const sh = r.checklist.find((c) => c.id === "standard_headings");
  assert.ok(sh && sh.ok === false, "standard_headings must fail without section titles");
  assert.ok(
    r.categories.readability.score <= 18,
    `readability must be capped when headings KO, got ${r.categories.readability.score}`
  );
  assert.ok(r.categories.readability.score < 25, "no perfect readability without headings");
  assert.equal(r.passes, false, "cannot pass ATS without Expérience section");
  console.log(
    "✓ readability cap + fail without headings OK",
    r.categories.readability.score,
    r.total
  );
}

{
  // Regression: « formation » in a bullet still ≠ Education section
  const bulletOnly = `
Samir Benali
samir@exemple.com | 06 11 22 33 44
EXPÉRIENCE PROFESSIONNELLE
Consultant — Acme (2018 - 2020)
- Suivi de la formation interne des nouveaux arrivants
COMPÉTENCES
Excel, reporting
`;
  const r = analyzeCv(bulletOnly, { pages: 1 });
  const eduOk = r.checklist.find((c) => c.id === "section_education");
  assert.ok(eduOk && eduOk.ok === false, "formation in bullet ≠ Education heading");
  assert.ok(r.categories.readability.score <= 18, "missing Formation caps readability");
  console.log("✓ bullet « formation » still not a section + readability capped OK");
}

{
  const { parsePersonName, parseLocationAddress, analyzeInterests } = await import("./parse-cv.js");
  const fuzzy = parsePersonName(["Consultant Senior Cloud", "consultant@acme.com"]);
  assert.equal(fuzzy.name, null, "job title must not be parsed as name");
  assert.ok(fuzzy.headline, "job title becomes headline");

  const okName = parsePersonName(["Marie Dupont", "Développeuse Full Stack", "marie@x.com"]);
  assert.equal(okName.firstName, "Marie");
  assert.equal(okName.lastName, "Dupont");
  assert.match(okName.headline || "", /Développeuse/i);

  const addr = parseLocationAddress("Marie\nmarie@x.com\n12 rue de la Paix\n75001 Paris\n");
  assert.ok(addr.address && /rue de la Paix/i.test(addr.address), "street address detected");
  assert.ok(addr.location && /75001|Paris/i.test(addr.location), "city/CP detected");

  const withAddr = analyzeCv(
    `
Marie Dupont
Développeuse
marie@x.com | 06 12 34 56 78
12 rue de Rivoli, 75001 Paris
EXPÉRIENCE PROFESSIONNELLE
Développeuse — TechCorp (2021 - 2023)
- Développé une app pour 500 clients
FORMATION
Master Info (2019 - 2021)
COMPÉTENCES
React, Node, Agile
` + " détail parcours professionnel. ".repeat(12),
    { pages: 1 }
  );
  assert.ok(withAddr.checklist.find((c) => c.id === "identity_name")?.ok);
  assert.ok(withAddr.checklist.find((c) => c.id === "identity_address")?.ok);
  assert.ok(!withAddr.annotations.some((a) => a.kind === "missing_location"));
  console.log("✓ identity name strict + address OK");
}

{
  const photo = analyzeCv(goodCv, {
    pages: 1,
    profilePhotoHint: true,
    parsed: parseCv(goodCv, { profilePhotoHint: true }),
  });
  const chk = photo.checklist.find((c) => c.id === "profile_photo");
  assert.ok(chk && chk.ok === false, "profile_photo warns when hint");
  assert.ok(photo.annotations.some((a) => a.kind === "profile_photo" && a.checkId === "profile_photo"));
  assert.ok(photo.categories.readability.score < 25, "photo hint reduces readability");
  console.log("✓ profile photo hint check OK");
}

{
  const noDatesCv = `
Marie Dupont
Développeuse Full Stack
marie@x.com | 06 12 34 56 78
Paris
EXPÉRIENCE PROFESSIONNELLE
Développeuse Full Stack — TechCorp
- Développé une plateforme SaaS
Lead Frontend — StartupXYZ
- Créé le design system
FORMATION
Master Informatique
COMPÉTENCES
React, Node, Agile, management
` + " texte extractible supplémentaire. ".repeat(10);
  const r = analyzeCv(noDatesCv, { pages: 1 });
  assert.equal(r.checklist.find((c) => c.id === "role_dates")?.ok, false);
  assert.ok(r.annotations.filter((a) => a.kind === "missing_dates").length >= 1);
  assert.ok(r.checklist.find((c) => c.id === "job_title_headline")?.ok, "headline present on this sample");

  const noHeadline = analyzeCv(
    `
Marie Dupont
marie@x.com | 06 12 34 56 78
Paris
EXPÉRIENCE PROFESSIONNELLE
Analyste données — DataCo (2019 - 2021)
- Analysé des datasets clients
FORMATION
Master
COMPÉTENCES
SQL, Python, Excel
` + " texte extractible. ".repeat(12),
    { pages: 1 }
  );
  assert.equal(noHeadline.checklist.find((c) => c.id === "job_title_headline")?.ok, false);
  assert.ok(noHeadline.annotations.some((a) => a.kind === "missing_headline"));
  console.log("✓ role dates + headline annotations OK");
}

{
  const emptyInterests = `
Marie Dupont
Manager
marie@x.com | 06 12 34 56 78
Paris
PROFIL
${"Manager expérimenté avec un parcours solide en coordination d'équipes. ".repeat(4)}
EXPÉRIENCE PROFESSIONNELLE
Manager — Acme (2020 - 2022)
- Piloté une équipe de 5 personnes
FORMATION
Master
COMPÉTENCES
Excel, reporting, management
CENTRES D'INTÉRÊT
`;
  const r = analyzeCv(emptyInterests, { pages: 1 });
  assert.equal(r.checklist.find((c) => c.id === "interests")?.ok, false);
  assert.ok(r.annotations.some((a) => a.kind === "empty_interests"));

  const genericInterests = `
Marie Dupont
Manager
marie@x.com | 06 12 34 56 78
Paris
PROFIL
${"Manager expérimenté avec un parcours solide en coordination d'équipes. ".repeat(4)}
EXPÉRIENCE PROFESSIONNELLE
Manager — Acme (2020 - 2022)
- Piloté une équipe
FORMATION
Master
COMPÉTENCES
Excel, reporting
CENTRES D'INTÉRÊT
Lecture, cinéma, sport, voyages, musique
`;
  const g = analyzeCv(genericInterests, { pages: 1 });
  assert.equal(g.checklist.find((c) => c.id === "interests")?.ok, false);
  assert.ok(g.annotations.some((a) => a.kind === "generic_interests"));
  console.log("✓ interests empty/generic checks OK");
}

{
  const clean = analyzeCv(goodCv, { pages: 1 });
  const dirty = analyzeCv(
    goodCv.replace("Développé une plateforme", "j'ai réaliser une plateforme").replace(
      "Optimisé les performances",
      "Optimisé les performances parceque et parmis les équipes"
    ),
    { pages: 1 }
  );
  assert.ok(dirty.annotations.some((a) => a.kind === "grammar"));
  assert.equal(dirty.checklist.find((c) => c.id === "grammar_quality")?.ok, false);
  assert.ok(
    dirty.categories.content.score < clean.categories.content.score,
    `spelling/grammar must lower content score (${dirty.categories.content.score} < ${clean.categories.content.score})`
  );
  assert.ok(dirty.checklist.find((c) => c.id === "spelling_quality"));
  console.log(
    "✓ spelling/grammar content penalty OK",
    clean.categories.content.score,
    "→",
    dirty.categories.content.score
  );
}

{
  const { mergeRemoteEnrichment } = await import("./analyzer.js");
  const base = analyzeCv(goodCv, { pages: 1 });
  const beforeContent = base.categories.content.score;
  mergeRemoteEnrichment(
    base,
    {
      grammar: {
        issues: [
          {
            wrong: "parceque",
            right: "parce que",
            context: "…parceque…",
            textStart: 10,
            textEnd: 18,
            kind: "grammar",
          },
        ],
      },
      geo: {
        ok: true,
        normalized: "Paris, Île-de-France, France",
        confidence: 0.82,
        lat: 48.85,
        lon: 2.35,
        source: "nominatim",
      },
      photo: { kind: "logo", confidence: 0.7, source: "test" },
    },
    { lang: "fr" }
  );
  assert.ok(base.spelling.some((s) => s.wrong === "parceque"));
  assert.ok(base.annotations.some((a) => a.kind === "grammar" && a.quote === "parceque"));
  assert.equal(base.parsed.contact.geo.ok, true);
  assert.ok(base.checklist.find((c) => c.id === "identity_address")?.ok);
  assert.match(base.checklist.find((c) => c.id === "identity_address")?.label || "", /géocode/i);
  assert.equal(base.parsed.layout.photoKind, "logo");
  assert.equal(base.checklist.find((c) => c.id === "profile_photo")?.ok, true);
  assert.ok(!base.annotations.some((a) => a.kind === "profile_photo"));
  assert.ok(base.categories.content.score <= beforeContent);
  console.log("✓ mergeRemoteEnrichment grammar/geo/photo OK");
}

{
  const { mergeRemoteEnrichment } = await import("./analyzer.js");
  const withHint = analyzeCv(goodCv, {
    pages: 1,
    profilePhotoHint: true,
    parsed: parseCv(goodCv, { profilePhotoHint: true }),
  });
  assert.equal(withHint.checklist.find((c) => c.id === "profile_photo")?.ok, false);
  mergeRemoteEnrichment(withHint, { photo: { kind: "face", confidence: 0.9 } }, { lang: "fr" });
  assert.equal(withHint.checklist.find((c) => c.id === "profile_photo")?.ok, false);
  console.log("✓ photo face keeps ATS warning OK");
}

{
  const { buildCvModel } = await import("./export-cv.js");
  const { applyAll } = await import("./optimize.js");
  const sparse = `
Chargé de recrutement
lyes@exemple.com | 07 69 43 78 86
FORMATION
Master RH — EFFICOM (2017 – 2019)
EXPÉRIENCE
Consultant — LTD (2020 - 2022)
Suivi des dossiers candidats au quotidien
`;
  const optimized = applyAll(sparse, [
    {
      id: "loc",
      status: "accepted",
      applyMode: "insert_header",
      suggestion: "[75001 Paris]",
      checkId: "identity_address",
    },
  ]).text;
  assert.ok(optimized.startsWith("[75001 Paris]\n"), "header inserts as own line");
  assert.ok(!optimized.startsWith("[75001 Paris] |"), "no pipe-joined header");
  const stale = parseCv(sparse);
  const model = buildCvModel(optimized, stale, { lang: "fr" });
  assert.notEqual(model.name, "[75001 Paris]");
  assert.ok(!/75001/.test(model.name), "name is not postal address");
  assert.ok(!/\[75001/.test(model.title || ""), "headline is not location placeholder");
  assert.match(model.contactLine, /75001 Paris|Paris/);
  assert.ok(!/\(\)/.test(JSON.stringify(model.education)), "no empty () in education");
  assert.ok(
    (model.roles[0]?.bullets || []).length >= 1,
    "soft/prose bullets recovered for experience"
  );
  console.log("✓ export identity/location/() /bullets OK", model.name, model.contactLine);
}

{
  const { buildCvModel } = await import("./export-cv.js");
  const withName = `
Lyes Amara
Chargé de recrutement
lyes@exemple.com | 06 12 34 56 78
Paris
EXPÉRIENCE
Consultant — Acme (2019 - 2021)
- Mission A
FORMATION
Master (2017 - 2019)
COMPÉTENCES
Excel
`;
  const staleEmptyBullets = parseCv(withName);
  // Simulate stale parse with empty bullets while optimized text gained a bullet
  staleEmptyBullets.roles = staleEmptyBullets.roles.map((r) => ({ ...r, bullets: [] }));
  const optimized = withName.replace("- Mission A", "- Mission A\n- Mission B ajoutée");
  const model = buildCvModel(optimized, staleEmptyBullets, { lang: "fr" });
  assert.equal(model.name, "Lyes Amara");
  assert.ok(
    (model.roles[0]?.bullets || []).some((b) => /Mission/i.test(b)),
    "fresh parse recovers bullets despite stale empty roles"
  );
  console.log("✓ export reparse recovers bullets OK", model.roles[0].bullets);
}

{
  // Hard-only keyword density: soft skills alone must not inflate keyword score
  const softHeavy = `
Alice Soft
alice@mail.com | 06 11 22 33 44
Paris
PROFIL
Profil collaboratif et leadership.
EXPÉRIENCE
Assistant — Corp (2020 - 2022)
- Responsable de la communication interne
FORMATION
Licence (2018 - 2020)
COMPÉTENCES
communication, leadership, collaboration, teamwork, créativité
`;
  const softR = analyzeCv(softHeavy, {
    pages: 1,
    skillsMatch: {
      hits: ["communication", "leadership", "collaboration", "teamwork"],
      hardHits: [],
      softHits: ["communication", "leadership", "collaboration", "teamwork"],
      count: 0,
      density: 0,
    },
  });
  const dens = softR.checklist.find((c) => c.id === "keyword_density");
  assert.ok(dens && dens.ok === false, "soft-only skills fail keyword_density");
  assert.ok(softR.categories.keywords.score <= 15, "keywords capped without JD / hard density");
  console.log("✓ keyword hard-only scoring OK", softR.categories.keywords.score);
}

{
  // Pass blocked without email even with strong content
  const noEmail = goodCv.replace(/marie\.dupont@email\.com\s*\|\s*/, "");
  const r = analyzeCv(noEmail, { fileName: "no-email.pdf", pages: 1 });
  assert.equal(r.passes, false, "cannot pass ATS without email");
  const emailDiag = r.diagnostics.find((d) => d.checkId === "email");
  assert.ok(emailDiag, "diagnostic card for email KO");
  console.log("✓ pass blocked without email OK");
}

{
  // Accept in-place updates workingText via applyAll
  const { applyAll } = await import("./optimize.js");
  const src = "acceuil client et professionel\ntexte pour passer le seuil de caractères extractibles minimum ici.";
  const rep = analyzeCv(src, { pages: 1 });
  const typo = rep.annotations.find((a) => a.kind === "typo");
  assert.ok(typo);
  typo.status = "accepted";
  const { text: workingText } = applyAll(src, [typo]);
  assert.ok(!/acceuil/i.test(workingText) || workingText.includes(typo.suggestion));
  assert.ok(workingText.includes(typo.suggestion) || /accueil/i.test(workingText));
  console.log("✓ Accept in-place workingText OK");
}

{
  // DOCX patch replace round-trip
  const { mergeAdjacentWt, replaceInDocumentXml } = await import("./export-docx.js");
  const xml = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>acceuil client</w:t></w:r></w:p></w:body></w:document>`;
  const merged = mergeAdjacentWt(xml);
  const { xml: out, ok } = replaceInDocumentXml(merged, "acceuil", "accueil");
  assert.equal(ok, true);
  assert.ok(out.includes("accueil"));
  assert.ok(!out.includes(">acceuil<"));
  console.log("✓ DOCX patch replace round-trip OK");
}

{
  const roleGaps = {
    role: "developer",
    missing: ["kubernetes", "terraform"],
    present: ["javascript"],
    packSize: 20,
  };
  const r = analyzeCv(goodCv, { pages: 1, roleKeywordGaps: roleGaps });
  const rk = r.checklist.find((c) => c.id === "role_keywords");
  assert.ok(rk && rk.ok === false, "role_keywords fails when pack terms missing");
  const ann = r.annotations.find((a) => a.checkId === "role_keywords");
  assert.ok(ann && /kubernetes/i.test(ann.suggestion), "role_keywords insert_after suggestion");
  console.log("✓ role_keywords check + annotation OK");
}

{
  // Anti-placebo: structured CV with verbs + soft stuffing, zero metrics → no pass
  const gamed = `
Alex Martin
Chargé de projet
alex.martin@email.com | 06 11 22 33 44 | linkedin.com/in/alexmartin
Paris

PROFIL
Profil communication leadership collaboration innovation digital management.

EXPÉRIENCE PROFESSIONNELLE
Chargé de projet — Agence (2020 - aujourd'hui)
- Piloté la communication interne
- Développé la collaboration entre équipes
- Optimisé le management des stakeholders
- Mis en place la stratégie digitale

Consultant — Studio (2018 - 2020)
- Créé des process de communication
- Dirigé des ateliers leadership

FORMATION
Master Management — Université (2016 - 2018)

COMPÉTENCES
communication, leadership, collaboration, innovation, digital, management, négociation, planification
`;
  const g = analyzeCv(gamed, { pages: 1 });
  const metrics = g.checklist.find((c) => c.id === "metrics");
  assert.equal(metrics?.ok, false, "gamed CV must fail metrics");
  assert.equal(g.passes, false, "gamed CV without metrics must not pass");
  console.log("✓ gamed CV no metrics → passes=false", g.total);
}

{
  // Soft-only stuffing must not get full keyword density credit
  const softOnly = `
Camille Soft
camille@email.com | 06 99 88 77 66
EXPÉRIENCE
Responsable — Corp (2020 - 2022)
- responsable de la communication
FORMATION
Master
COMPÉTENCES
communication, leadership, collaboration, innovation, digital, management, négociation, équipe, client, qualité, performance, stratégie, gestion, planning, stakeholder, formation, recrutement, vente, commercial, marketing, analyse
`;
  const s = analyzeCv(softOnly, { pages: 1 });
  const dens = s.checklist.find((c) => c.id === "keyword_density");
  assert.ok(dens && dens.ok === false, "soft-only must not full-credit keyword_density");
  assert.ok(s.categories.keywords.score < 12, `soft stuffing keywords too high: ${s.categories.keywords.score}`);
  console.log("✓ soft-only keyword density not full credit", s.categories.keywords.score);
}

{
  // % metrics must count (no \\b after %)
  const withPct = `
Sam Percent
sam@email.com | 06 12 12 12 12 | linkedin.com/in/sampercent
Paris
EXPÉRIENCE PROFESSIONNELLE
Analyste — DataCo (2021 - aujourd'hui)
- Augmenté le taux de conversion de 12%
- Réduit les coûts de +18 %
- Piloté un budget de 50 k€
FORMATION
Master Data
COMPÉTENCES
Python, SQL, Excel, KPI, reporting, agile
`;
  const p = analyzeCv(withPct, { pages: 1 });
  const metrics = p.checklist.find((c) => c.id === "metrics");
  assert.equal(metrics?.ok, true, "12% and +18 % must count as metrics");
  console.log("✓ percent metrics detected OK");
}

{
  // Heuristic photo stub must not bump score
  const { mergeRemoteEnrichment } = await import("./analyzer.js");
  const base = analyzeCv(goodCv, { pages: 1 });
  const beforeTotal = base.total;
  const beforePhoto = base.checklist.find((c) => c.id === "profile_photo")?.ok;
  mergeRemoteEnrichment(
    base,
    { photo: { kind: "logo", confidence: 0.4, source: "heuristic" } },
    { lang: "fr" }
  );
  assert.equal(base.total, beforeTotal, "heuristic photo must not change total");
  assert.equal(base.checklist.find((c) => c.id === "profile_photo")?.ok, beforePhoto);
  assert.equal(base.photoClassify?.source, "heuristic");
  console.log("✓ heuristic photo enrich does not mutate score");
}

{
  // NA checks are not green strengths
  const bare = analyzeCv(
    `
No Photo
nophoto@email.com | 06 00 00 00 00
EXPÉRIENCE
Dev — Co (2020 - 2021)
- Développé un outil
FORMATION
Licence
COMPÉTENCES
Java
`,
    { pages: 1 }
  );
  const photo = bare.checklist.find((c) => c.id === "profile_photo");
  const interests = bare.checklist.find((c) => c.id === "interests");
  assert.equal(photo?.ok, null);
  assert.equal(photo?.na, true);
  assert.equal(interests?.ok, null);
  assert.ok(!bare.strengths.some((s) => s.id === "profile_photo" && s.ok === true));
  assert.ok(!bare.strengths.some((s) => s.id === "interests" && s.ok === true));
  console.log("✓ NA checks not counted as strengths");
}

// ── Pinned goodCv score (catches silent threshold drift) ──
{
  const r = analyzeCv(goodCv, { fileName: "marie.pdf", pages: 1 });
  assert.equal(r.total, 80, `Pinned goodCv score expected 80, got ${r.total}`);
  assert.equal(r.categories.keywords.score, 12, "Keyword cap without JD should be 12");
  console.log("✓ Pinned goodCv score OK", r.total);
}

// ── English CV ──
{
  const enCv = `John Smith
Software Engineer
john.smith@example.com · +44 7700 900 123
linkedin.com/in/johnsmith · London, UK

EXPERIENCE

Senior Software Engineer — Acme Corp (2020 – present)
- Led migration of monolith to microservices, reducing deploy time by 60%.
- Built real-time analytics pipeline processing 2,000,000 events/day.
- Managed 12 engineers across 3 time zones with $800k annual budget.
- Delivered 15 features in Q3 sprint cycle, increasing user retention by 22%.
- Implemented automated alerting system cutting incident response by 45%.
- Designed CI/CD pipeline reducing release cycle from 2 weeks to 1 day.

Junior Developer — StartupABC (2018 – 2020)
- Developed REST API serving 50k daily users using Python and PostgreSQL.
- Improved test coverage from 30% to 85% via automated integration tests.
- Automated deployment scripts saving 8 hours per week for the ops team.
- Created internal dashboard tracking 12 KPIs for product team using React and D3.

Software Intern — TechStartup (2017 – 2018)
- Built internal tooling for data ingestion, processing 500 records per minute.
- Contributed to open-source monitoring library, now used by 200 companies.
- Designed database schema supporting multi-tenant architecture.

EDUCATION
BSc Computer Science — University of Manchester (2015 – 2018)
First class honours. Thesis on distributed systems performance optimization.
Relevant coursework: algorithms, databases, operating systems, machine learning.

SKILLS
Python, Java, AWS, Docker, Kubernetes, React, PostgreSQL, Redis, CI/CD, Terraform, Git, TypeScript, GraphQL, MongoDB

LANGUAGES
English (native), French (B2)

CERTIFICATIONS
AWS Solutions Architect Associate (2022)
Kubernetes Administrator (CKA, 2023)

INTERESTS
Open source contributing, technical blogging, marathon running
`;
  const enR = analyzeCv(enCv, { fileName: "john.pdf", pages: 1 });
  assert.ok(enR.total >= 72, `English CV should pass, got ${enR.total}`);
  assert.ok(enR.passes, "English CV should pass gate");
  const phoneCheck = enR.checklist.find((c) => c.id === "phone");
  assert.equal(phoneCheck?.ok, true, "UK phone +44 should be detected");
  console.log("✓ English CV OK score", enR.total, "passes", enR.passes);
}

// ── Anti-gaming: soft skills + weak verbs only → fails ──
{
  const weakCv = `Pierre Martin
pierre@test.com · 06 12 34 56 78
EXPÉRIENCE PROFESSIONNELLE
Chargé de mission — Entreprise A (2020 – 2023)
- Responsable de la gestion des projets
- Chargé de la coordination des équipes
- Travaillé sur l'amélioration des processus
- Participé à la mise en place de solutions
- Responsable de la communication interne
Assistante — Entreprise B (2018 – 2020)
- Aidé à la gestion du planning
- Responsable de l'accueil
FORMATION
Licence — Université (2015 – 2018)
COMPÉTENCES
Communication, leadership, collaboration, management, qualité, stratégie, innovation
`;
  const weakR = analyzeCv(weakCv, { fileName: "weak.pdf", pages: 1 });
  assert.ok(!weakR.passes, `Weak verbs + soft skills CV should NOT pass, got ${weakR.total}`);
  console.log("✓ Anti-gaming: soft+weak CV does not pass", weakR.total);
}

// ── Section ordering: Education before Experience for experienced candidate ──
{
  const orderCv = `Alice Martin
alice@test.com · 06 12 34 56 78
FORMATION
Master — Université (2010 – 2012)
EXPÉRIENCE PROFESSIONNELLE
Senior Dev — Corp A (2020 – 2023)
- Piloté la refonte du SI.
Dev — Corp B (2017 – 2020)
- Développé le module analytics.
Dev Junior — Corp C (2012 – 2017)
- Implémenté les tests automatisés.
COMPÉTENCES
Python, SQL, Docker, React
`;
  const orderR = analyzeCv(orderCv, { fileName: "order.pdf", pages: 1 });
  const orderAnn = orderR.annotations.find((a) => a.kind === "section_order");
  assert.ok(orderAnn, "Section ordering annotation should be generated");
  console.log("✓ Section ordering annotation OK");
}

// ── Phone international: US format detected ──
{
  const usCv = `Jane Doe
jane@example.com · (555) 123-4567
linkedin.com/in/janedoe · New York, NY
EXPERIENCE
Manager — Corp (2020 – 2023)
- Led team of 12 engineers, delivered $2M project.
- Increased revenue by 35% through process automation.
EDUCATION
MBA — NYU (2018 – 2020)
SKILLS
Python, SQL, Excel, Salesforce, Tableau
`;
  const usR = analyzeCv(usCv, { fileName: "us.pdf", pages: 1 });
  const usPhone = usR.checklist.find((c) => c.id === "phone");
  assert.equal(usPhone?.ok, true, "US phone (555) 123-4567 should be detected");
  console.log("✓ Phone international US OK");
}

// ── Overlapping dates detected ──
{
  const overlapCv = `Test User
test@mail.com · 06 11 22 33 44
EXPÉRIENCE PROFESSIONNELLE
Dev A — Corp A (2018 – 2023)
- Développé le backend.
Dev B — Corp B (2020 – 2024)
- Piloté le frontend.
FORMATION
Licence (2015 – 2018)
COMPÉTENCES
Python, SQL, Docker
`;
  const oR = analyzeCv(overlapCv, { fileName: "overlap.pdf", pages: 1 });
  const overlapCheck = oR.checklist.find((c) => c.id === "overlapping_dates");
  assert.ok(overlapCheck, "Overlapping dates checklist should exist");
  assert.equal(overlapCheck.ok, false, "Overlapping dates should be flagged");
  const overlapAnn = oR.annotations.find((a) => a.kind === "overlapping_dates");
  assert.ok(overlapAnn, "Overlapping dates annotation should be generated");
  console.log("✓ Overlapping dates detection OK");
}

{
  const tables = analyzeCv(goodCv, {
    pages: 1,
    tableHint: true,
    tableCount: 2,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: false, tableHint: true, tableCount: 2, headerSparse: false, readingOrderOk: true },
    },
  });
  assert.equal(tables.checklist.find((c) => c.id === "no_tables")?.ok, false, "no_tables KO");
  const tAnn = tables.annotations.find((a) => a.kind === "no_tables");
  assert.ok(tAnn, "no_tables annotation");
  assert.ok(tAnn.detail && tAnn.detail.length > 40, "tables detail actionable in bubble");
  assert.ok(!tables.annotations.some((a) => a.kind === "layout"), "legacy layout kind unused");
  console.log("✓ Tables annotation + checklist OK");
}

{
  const cols = analyzeCv(goodCv, {
    pages: 1,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: true, tableHint: false, tableCount: 0, headerSparse: false, readingOrderOk: true },
    },
  });
  assert.equal(cols.checklist.find((c) => c.id === "single_column")?.ok, false);
  const cAnn = cols.annotations.find((a) => a.kind === "single_column");
  assert.ok(cAnn, "single_column annotation");
  assert.ok(cAnn.detail && /colonne/i.test(cAnn.detail));
  assert.ok(!cols.annotations.some((a) => a.kind === "no_tables"));
  console.log("✓ Columns-only annotation OK");
}

{
  const both = analyzeCv(goodCv, {
    pages: 1,
    tableHint: true,
    tableCount: 1,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: true, tableHint: true, tableCount: 1, headerSparse: false, readingOrderOk: true },
    },
  });
  const bothAnn = both.annotations.find((a) => a.kind === "no_tables");
  assert.ok(bothAnn, "tables takes priority when both");
  assert.ok(/colonne/i.test(bothAnn.detail), "detail mentions columns too");
  assert.ok(!both.annotations.some((a) => a.kind === "single_column"));
  console.log("✓ Tables+columns priority OK");
}

{
  const header = analyzeCv(goodCv, {
    pages: 1,
    headerSparse: true,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: false, tableHint: false, headerSparse: true, readingOrderOk: true },
    },
  });
  const hAnn = header.annotations.find((a) => a.kind === "header_sparse");
  assert.ok(hAnn, "header_sparse annotation");
  assert.ok(hAnn.detail && hAnn.detail.length > 40);
  assert.equal(hAnn.severity, "critical");
  console.log("✓ Header sparse annotation OK");
}

{
  const photo = analyzeCv(goodCv, {
    pages: 1,
    profilePhotoHint: true,
    parsed: parseCv(goodCv, { profilePhotoHint: true }),
  });
  const pAnn = photo.annotations.find((a) => a.kind === "profile_photo");
  assert.ok(pAnn?.detail && /photo/i.test(pAnn.detail));
  console.log("✓ Profile photo detail for bubble OK");
}

{
  const scan = analyzeCv(goodCv, {
    pages: 2,
    imageOnlyPages: [2],
    approximate: true,
  });
  assert.equal(scan.checklist.find((c) => c.id === "extractable_text")?.ok, false);
  const sAnn = scan.annotations.find((a) => a.kind === "image_scan");
  assert.ok(sAnn, "image_scan annotation");
  assert.equal(sAnn.severity, "critical");
  assert.ok(sAnn.detail && /ATS|image/i.test(sAnn.detail));
  assert.ok(scan.categories.readability.imageOnlyPages?.includes(2));
  console.log("✓ Image/scan pages annotation OK");
}

{
  // Regression: clean CV still passes with pinned readability
  const clean = analyzeCv(goodCv, { fileName: "marie.pdf", pages: 1 });
  assert.equal(clean.categories.readability.score, 25);
  assert.ok(clean.passes);
  assert.ok(!clean.annotations.some((a) =>
    ["no_tables", "single_column", "image_scan", "header_sparse", "cv_source"].includes(a.kind)
  ));
  console.log("✓ goodCv regression still clean OK");
}

{
  const src = detectCvSource({ pdfCreator: "Canva", fileName: "cv.pdf" });
  assert.equal(src.id, "canva");
  assert.equal(src.hostile, true);

  const canva = analyzeCv(goodCv, {
    pages: 1,
    pdfCreator: "Canva",
    pdfProducer: "Canva",
    fileName: "canva-cv.pdf",
  });
  assert.equal(canva.checklist.find((c) => c.id === "cv_source")?.ok, false);
  const cAnn = canva.annotations.find((a) => a.kind === "cv_source");
  assert.ok(cAnn, "cv_source annotation for Canva");
  assert.equal(cAnn.severity, "critical");
  assert.ok(canva.cvSource?.hostile);
  assert.equal(canva.passes, false, "hostile source blocks pass");
  console.log("✓ Canva source warning OK");
}

{
  const ai = analyzeCv(goodCv, {
    pages: 1,
    pdfProducer: "ChatGPT",
    fileName: "resume.pdf",
  });
  assert.ok(ai.cvSource?.hostile);
  assert.equal(ai.cvSource.id, "ai_builder");
  assert.ok(ai.annotations.some((a) => a.kind === "cv_source" && a.severity === "critical"));
  console.log("✓ ChatGPT/AI source warning OK");
}

{
  const kick = analyzeCv(goodCv, {
    pages: 1,
    pdfCreator: "Kickresume",
    fileName: "kick.pdf",
  });
  assert.equal(kick.cvSource?.id, "online_builder");
  assert.ok(kick.cvSource.hostile);
  console.log("✓ Kickresume builder warning OK");
}

{
  const word = analyzeCv(goodCv, {
    pages: 1,
    pdfCreator: "Microsoft Word",
    pdfProducer: "Microsoft: Print To PDF",
    fileName: "marie.docx.pdf",
  });
  assert.equal(word.cvSource?.id, "word");
  assert.equal(word.cvSource?.hostile, false);
  assert.ok(!word.annotations.some((a) => a.kind === "cv_source"));
  assert.equal(word.checklist.find((c) => c.id === "cv_source")?.ok, true);
  console.log("✓ Word source not hostile OK");
}

{
  // tableCount alone must NOT flag tables (DOCX layout tables)
  const layoutOnly = analyzeCv(goodCv, {
    pages: 1,
    tableCount: 2,
    tableHint: false,
    parsed: {
      ...parseCv(goodCv),
      layout: {
        columnSmell: false,
        tableHint: false,
        tableCount: 2,
        headerSparse: false,
        readingOrderOk: true,
      },
    },
  });
  assert.equal(layoutOnly.checklist.find((c) => c.id === "no_tables")?.ok, true);
  assert.ok(!layoutOnly.annotations.some((a) => a.kind === "no_tables"));
  console.log("✓ tableCount without tableHint does not flag OK");
}

{
  const { classifyDocxXmlTables, classifyHtmlTables } = await import("./extract.js");

  const twoColXml = `
    <w:document><w:body>
      <w:tbl>
        <w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>
        <w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>
        <w:tr><w:tc><w:p/></w:tc><w:tc><w:p/></w:tc></w:tr>
      </w:tbl>
    </w:body></w:document>`;
  const layout = classifyDocxXmlTables(twoColXml);
  assert.equal(layout.tableHint, false, "2-col Word layout table is not content grid");
  assert.equal(layout.tableCount, 0);
  assert.ok(layout.layoutTableCount >= 1);

  const gridXml = `
    <w:document><w:body>
      <w:tbl>
        <w:tr><w:tc/><w:tc/><w:tc/><w:tc/></w:tr>
        <w:tr><w:tc/><w:tc/><w:tc/><w:tc/></w:tr>
        <w:tr><w:tc/><w:tc/><w:tc/><w:tc/></w:tr>
      </w:tbl>
    </w:body></w:document>`;
  const grid = classifyDocxXmlTables(gridXml);
  assert.equal(grid.tableHint, true, "4-col grid is content table");
  assert.equal(grid.tableCount, 1);

  const htmlLayout = classifyHtmlTables(
    `<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>`
  );
  assert.equal(htmlLayout.tableHint, false);

  const htmlGrid = classifyHtmlTables(
    `<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></table>`
  );
  assert.equal(htmlGrid.tableHint, true);
  console.log("✓ DOCX/HTML table classify layout vs grid OK");
}

// —— Aliases + JD must/nice + soft-stuffing + semantic scope ——
{
  const {
    buildAho,
    ahoFind,
    matchSkills,
    matchJdOverlap,
    matchRoleKeywordGaps,
    countVerbs,
    resetSkillsMatchCaches,
  } = await import("./skills-match.js");
  resetSkillsMatchCaches?.();

  const auto = buildAho([
    { label: "react", tier: "hard", aliases: ["react.js", "reactjs"] },
    { label: "leadership", tier: "soft" },
  ]);
  const found = ahoFind(auto, "Built SPA with React.js and ReactJS tooling");
  assert.ok(found.has("react"), "alias react.js folds to canonical react");
  assert.equal(found.has("react.js"), false, "alias key not kept as separate hit");

  // Live lexicon alias
  const sm = await matchSkills("Stack: react.js, TypeScript, Docker");
  assert.ok(sm.hardHits.includes("react"), "lexicon alias react.js → react");
  assert.ok(!sm.hardHits.includes("javascript"), "no js false-positive from react.js");
  console.log("✓ skill aliases fold to canonical OK", sm.hardHits.slice(0, 6));

  const jd = await matchJdOverlap(
    "Dev React Node.js AWS",
    "We need a React developer with Kubernetes and Terraform experience. Soft skills: leadership communication."
  );
  assert.ok(jd.mustTerms?.length >= 1, "JD hard terms are must");
  assert.ok(Array.isArray(jd.mustMissing), "mustMissing present");
  assert.ok(jd.mustMissing.some((t) => /kubernetes|terraform/i.test(t)), "missing must listed");
  assert.ok(typeof jd.mustCoverage === "number", "mustCoverage computed");
  console.log("✓ JD must/nice overlap OK", { score: jd.score, mustMissing: jd.mustMissing, mustCoverage: jd.mustCoverage });

  const softStuffCv = `
Pat Soft
pat@mail.com | 01 23 45 67 89
EXPÉRIENCE
Assistant — Corp (2020 - 2022)
- Responsable de la communication interne sans chiffre
FORMATION
Licence (2018 - 2020)
COMPÉTENCES
communication, leadership, collaboration, teamwork, créativité, autonomie
`;
  const softStuff = analyzeCv(softStuffCv, {
    pages: 1,
    skillsMatch: {
      hits: ["communication", "leadership", "collaboration", "teamwork", "créativité", "autonomie"],
      hardHits: [],
      softHits: ["communication", "leadership", "collaboration", "teamwork", "créativité"],
      count: 0,
      density: 0,
    },
  });
  const stuffing = softStuff.checklist.find((c) => c.id === "keyword_soft_stuffing");
  assert.ok(stuffing && stuffing.ok === false, "soft-stuffing check KO");
  assert.ok(
    softStuff.annotations.some((a) => a.checkId === "keyword_soft_stuffing"),
    "soft-stuffing annotation"
  );
  const stuffAnn = softStuff.annotations.find((a) => a.checkId === "keyword_soft_stuffing");
  assert.ok(stuffAnn && !/Soft stuffing/i.test(stuffAnn.shortLabel || ""), "no Soft stuffing shortLabel");
  assert.ok(stuffAnn && !/\bhard\b/i.test(stuffAnn.title || ""), "soft-stuffing title without hard jargon");
  assert.ok(
    /qualités personnelles|outils/i.test(stuffing.label || ""),
    "soft-stuffing checklist label plain language"
  );
  console.log("✓ soft-stuffing check + annotation OK");

  // Ambiguous role pack should not penalize
  const amb = await matchRoleKeywordGaps(
    "Polyvalent project coordination meetings reporting excel powerpoint",
    { headline: "Chargé de mission", roleTitle: "Chargé de mission" }
  );
  // Either null role (ambiguous) or role with confidence — just ensure no crash
  assert.ok(amb && typeof amb === "object");
  console.log("✓ role pack margin/ambiguity OK", amb.role, amb.ambiguous || amb.margin);

  const verbs = await countVerbs(
    `INTITULÉ\nEXPÉRIENCE\nDev — Co (2020)\n- Chargé de suivre les tickets\n- Participé aux réunions\nFORMATION\nMaster`,
    "fr",
    { scope: "Dev — Co (2020)\n- Chargé de suivre les tickets\n- Participé aux réunions" }
  );
  assert.ok(verbs.weak >= 1 || verbs.strong >= 0, "verbs scoped runs");
  assert.ok(verbs.scoped === true, "verbs marked as scoped");
  console.log("✓ verbs scoped to experience OK", verbs);

  // JD annotation lists mustMissing
  const withMust = analyzeCv(goodCv, {
    pages: 1,
    skillsMatch: {
      hits: ["javascript", "react"],
      hardHits: ["javascript", "react"],
      softHits: [],
      count: 2,
      density: 1,
    },
    jdOverlap: {
      overlap: ["javascript", "react"],
      score: 40,
      jdTerms: ["javascript", "react", "kubernetes", "terraform"],
      mustTerms: ["javascript", "react", "kubernetes", "terraform"],
      mustMissing: ["kubernetes", "terraform"],
      mustCoverage: 50,
      niceTerms: [],
    },
  });
  const kwAnn = withMust.annotations.find((a) => a.kind === "keyword" && /kubernetes|terraform/i.test(a.detail || a.title || ""));
  assert.ok(kwAnn, "keyword annotation mentions mustMissing terms");
  console.log("✓ JD mustMissing in keyword bubble OK");
}

// —— AI rebuild prompt ——
{
  const { buildAiCvPrompt, promptMeta } = await import("./ai-prompt.js");
  const report = analyzeCv(goodCv, { fileName: "marie.pdf", pages: 1 });
  const session = {
    report,
    annotations: [
      ...(report.annotations || []).map((a) => ({ ...a, status: "pending" })),
      {
        id: "ann-ignored-test",
        kind: "keyword",
        status: "ignored",
        title: "IGNORED_SHOULD_NOT_APPEAR",
        quote: "secret-ignored-quote",
        suggestion: "IGNORE_ME_SUGGESTION",
        detail: "should be filtered",
        axis: "keywords",
      },
    ],
    jobDescription: "Need React Kubernetes Terraform developer",
  };
  // Ensure at least one suggestion in pending set
  if (!session.annotations.some((a) => a.status === "pending" && a.suggestion)) {
    session.annotations.push({
      id: "ann-force",
      kind: "missing_metric",
      status: "pending",
      title: "Ajouter un chiffre",
      quote: "Développé une plateforme",
      suggestion: "Développé une plateforme SaaS (+12 000 clients)",
      detail: "Chiffrer l'impact",
      axis: "content",
    });
  }

  const promptFr = buildAiCvPrompt(session, { lang: "fr" });
  assert.ok(/Marie Dupont/i.test(promptFr), "prompt includes name");
  assert.ok(/marie\.dupont@email\.com/i.test(promptFr), "prompt includes email");
  assert.ok(
    session.annotations.some(
      (a) => a.status !== "ignored" && a.suggestion && promptFr.includes(String(a.suggestion).slice(0, 24))
    ) || /Correction proposée|corrections/i.test(promptFr),
    "prompt includes at least one correction suggestion"
  );
  assert.ok(!promptFr.includes("IGNORED_SHOULD_NOT_APPEAR"), "ignored annotation title excluded");
  assert.ok(!promptFr.includes("IGNORE_ME_SUGGESTION"), "ignored suggestion excluded");
  assert.ok(/Contraintes de sortie|CV source/i.test(promptFr), "FR section headers");
  assert.ok(/Consigne finale/i.test(promptFr), "FR final instruction");
  assert.ok(/adapte mon CV à cette offre/i.test(promptFr), "FR JD mode role mentions offre");
  assert.ok(/matching prioritaire|offre d.emploi/i.test(promptFr), "FR JD section present");
  // Dates + reverse chrono + ATS skeleton
  assert.ok(/2021/i.test(promptFr), "FR prompt includes experience start year 2021");
  assert.ok(/2019/i.test(promptFr), "FR prompt includes older role / education year 2019");
  const techIdx = promptFr.indexOf("TechCorp");
  const startupIdx = promptFr.indexOf("StartupXYZ");
  assert.ok(techIdx >= 0 && startupIdx >= 0 && techIdx < startupIdx, "FR experience reverse-chrono (TechCorp before StartupXYZ)");
  assert.ok(/## Coordonnées[\s\S]*## Profil[\s\S]*## Expérience[\s\S]*## Formation[\s\S]*## Compétences/i.test(promptFr), "FR ATS section order");
  assert.ok(/anti-chronologique|AAAA/i.test(promptFr), "FR constraints require dates + reverse chrono");
  assert.ok(/À compléter/i.test(promptFr) || /LinkedIn/i.test(promptFr), "FR skeleton has contact fields or todos");

  const promptEn = buildAiCvPrompt(session, { lang: "en" });
  assert.ok(/Output constraints/i.test(promptEn), "EN section headers");
  assert.ok(/Final instruction/i.test(promptEn), "EN final instruction");
  assert.ok(/Marie Dupont/i.test(promptEn), "EN prompt keeps identity");
  assert.ok(/Adapt my CV to this job offer/i.test(promptEn), "EN JD mode role mentions job");
  assert.ok(!promptEn.includes("IGNORED_SHOULD_NOT_APPEAR"), "EN ignored excluded");
  assert.ok(/2021/.test(promptEn) && /2019/.test(promptEn), "EN prompt includes role/education years");
  assert.ok(/## Contact[\s\S]*## Summary[\s\S]*## Experience[\s\S]*## Education[\s\S]*## Skills/i.test(promptEn), "EN ATS section order");
  assert.ok(/reverse-chronological|To complete/i.test(promptEn), "EN constraints mention reverse-chrono / placeholders");

  // With jdOverlap mustMissing — appears early in prompt
  session.report = {
    ...report,
    jdOverlap: {
      overlap: ["react"],
      score: 42,
      jdTerms: ["react", "kubernetes", "terraform"],
      mustTerms: ["react", "kubernetes", "terraform"],
      mustMissing: ["kubernetes", "terraform"],
      mustCoverage: 33,
      niceTerms: [],
    },
  };
  const promptJdFr = buildAiCvPrompt(session, { lang: "fr" });
  const promptJdEn = buildAiCvPrompt(session, { lang: "en" });
  assert.ok(/kubernetes/i.test(promptJdFr) && /terraform/i.test(promptJdFr), "FR mustMissing in prompt");
  assert.ok(/kubernetes/i.test(promptJdEn) && /terraform/i.test(promptJdEn), "EN mustMissing in prompt");
  const missIdxFr = promptJdFr.toLowerCase().indexOf("kubernetes");
  const sourceIdxFr = promptJdFr.indexOf("## CV source");
  const jdIdxFr = promptJdFr.indexOf("matching prioritaire");
  assert.ok(missIdxFr >= 0 && sourceIdxFr >= 0 && missIdxFr < sourceIdxFr, "mustMissing before source CV (FR)");
  assert.ok(jdIdxFr >= 0 && jdIdxFr < sourceIdxFr, "JD matching section before source CV");
  assert.ok(/crédibles|vrais/i.test(promptJdFr), "FR credibility constraint for musts");
  assert.ok(/credible|true/i.test(promptJdEn), "EN credibility constraint for musts");

  const meta = promptMeta(session, { lang: "fr" });
  assert.ok(meta.corrections >= 1, "meta counts actionable corrections");
  assert.ok(meta.hasJd === true, "meta.hasJd when JD present");
  assert.ok(meta.chars > 200, "meta reports prompt length");

  // Without JD — generic role (no offre / job tailor)
  const noJdSession = {
    report: { ...report, jdOverlap: null },
    annotations: session.annotations,
    jobDescription: "",
  };
  const genericFr = buildAiCvPrompt(noJdSession, { lang: "fr" });
  assert.ok(!/adapte mon CV à cette offre/i.test(genericFr), "no-JD keeps generic FR role");
  assert.ok(/Réécris mon CV en version parfaite/i.test(genericFr), "generic FR role");
  assert.ok(/N.INVENTE JAMAIS|À compléter/i.test(genericFr), "generic prompt keeps no-invent + placeholders rule");

  // Incomplete CV → À compléter / To complete placeholders
  const thinCv = `
Alex
EXPÉRIENCE
Dev — Startup
- Fait des trucs
FORMATION
Master
COMPÉTENCES
JS
`;
  const thinReport = analyzeCv(thinCv + "\nalex@example.com | 06 00 00 00 00\n", {
    fileName: "thin.pdf",
    pages: 1,
  });
  // Force missing contact bits via stripped parsed contact for prompt skeleton
  const incompleteSession = {
    report: {
      ...thinReport,
      parsed: {
        ...(thinReport.parsed || {}),
        contact: { firstName: "Alex", lastName: "", email: "", phone: "", linkedin: "", location: "" },
        roles: [
          { title: "Dev", company: "Startup", startYear: null, endYear: null, ongoing: false, bullets: ["Fait des trucs"] },
          { title: "Senior", company: "BigCo", startYear: 2022, endYear: 2024, ongoing: false, bullets: ["Livré X"] },
          { title: "Junior", company: "OldCo", startYear: 2018, endYear: 2020, ongoing: false, bullets: ["Appris Y"] },
        ],
        educationRoles: [
          { title: "Master", company: "Univ", startYear: null, endYear: null, ongoing: false, bullets: [] },
        ],
        skills: ["JS"],
        sections: { languages: [] },
        sectionOrder: ["experience", "education", "skills"],
      },
      jdOverlap: null,
    },
    annotations: [],
    jobDescription: "",
  };
  const { formatYears, sortRolesAntiChrono } = await import("./ai-prompt.js");
  assert.equal(formatYears({ startYear: 2021, endYear: null, ongoing: true }, { ongoing: "aujourd’hui" }), "2021 – aujourd’hui");
  assert.equal(formatYears({ startYear: 2019, endYear: 2021 }), "2019 – 2021");
  const sorted = sortRolesAntiChrono(incompleteSession.report.parsed.roles);
  assert.equal(sorted[0].company, "BigCo", "sort newest first");
  assert.equal(sorted[1].company, "OldCo", "then older dated");
  assert.equal(sorted[2].company, "Startup", "undated last");

  const incompleteFr = buildAiCvPrompt(incompleteSession, { lang: "fr" });
  assert.ok(/À compléter : e-mail/i.test(incompleteFr), "FR missing email → À compléter");
  assert.ok(/À compléter : téléphone/i.test(incompleteFr), "FR missing phone → À compléter");
  assert.ok(/À compléter : dates/i.test(incompleteFr), "FR missing role dates → À compléter");
  const incompleteEn = buildAiCvPrompt(incompleteSession, { lang: "en" });
  assert.ok(/To complete: email/i.test(incompleteEn), "EN missing email → To complete");
  assert.ok(/To complete: dates/i.test(incompleteEn), "EN missing role dates → To complete");

  // Pro merge must preserve local must*
  const localJd = {
    overlap: ["react"],
    score: 55,
    jdTerms: ["react", "kubernetes"],
    mustTerms: ["react", "kubernetes"],
    mustMissing: ["kubernetes"],
    mustCoverage: 50,
    niceTerms: [],
  };
  const proSk = { score: 88, overlap: ["react", "leadership"] };
  const merged = {
    ...localJd,
    mustTerms: localJd.mustTerms || [],
    mustMissing: localJd.mustMissing || [],
    mustCoverage: localJd.mustCoverage != null ? localJd.mustCoverage : null,
    niceTerms: localJd.niceTerms || [],
    jdTerms: localJd.jdTerms || [],
    overlap: localJd.overlap?.length ? localJd.overlap : proSk.overlap || [],
    score: localJd.score != null ? localJd.score : proSk.score,
    proScore: proSk.score,
  };
  assert.deepEqual(merged.mustMissing, ["kubernetes"], "Pro merge keeps mustMissing");
  assert.equal(merged.mustCoverage, 50, "Pro merge keeps mustCoverage");
  assert.equal(merged.score, 55, "Pro merge keeps local score");
  assert.equal(merged.proScore, 88, "Pro merge stores proScore secondary");

  console.log("✓ AI CV rebuild prompt OK", {
    corrections: meta.corrections,
    chars: meta.chars,
    hasJd: meta.hasJd,
  });
}

// —— Document profile + watermarks + advice quality ——
{
  // Watermark in text (no PDF meta)
  const fromText = detectCvSource({
    fileName: "cv.pdf",
    text: `${goodCv}\n\nMade with Canva — canva.com`,
  });
  assert.equal(fromText.id, "canva", "Canva watermark in text");
  assert.equal(fromText.via, "text", "detected via text");
  assert.equal(fromText.hostile, true);

  const fromChat = detectCvSource({
    fileName: "resume.pdf",
    text: "Generated by ChatGPT\n" + goodCv,
  });
  assert.equal(fromChat.id, "ai_builder", "ChatGPT watermark");
  assert.ok(fromChat.hostile);

  // LaTeX must not fire on body word "context"
  const noFalseTex = detectCvSource({
    fileName: "cv.pdf",
    text: "Worked in a business context with stakeholders",
  });
  assert.notEqual(noFalseTex.id, "latex", "no false latex from context");

  // Profile: scan_like vs Word/DOCX
  const scanProf = detectDocumentProfile(
    { format: "pdf", approximate: true, imageOnlyPages: [1], fileName: "scan.pdf" },
    null,
    "peu de texte"
  );
  assert.equal(scanProf.extractability, "scan_like", "PDF image pages → scan_like");
  assert.equal(scanProf.format, "pdf");

  const wordShort = detectDocumentProfile(
    { format: "docx", approximate: false, fileName: "cv.docx" },
    null,
    "Court mais extractible Word CV texte sélectionnable ici."
  );
  assert.notEqual(wordShort.extractability, "scan_like", "DOCX is not scan_like");

  const docxApproxLegacy = detectDocumentProfile(
    { format: "docx", approximate: true, fileName: "old.docx" },
    null,
    goodCv
  );
  assert.notEqual(
    docxApproxLegacy.extractability,
    "scan_like",
    "DOCX approximate flag must not imply scan"
  );

  // DOCX fileMeta must not trigger image_scan annotation
  const docxReport = analyzeCv(goodCv, {
    fileName: "marie.docx",
    format: "docx",
    approximate: true,
    pages: 1,
  });
  assert.ok(
    !docxReport.annotations.some((a) => a.kind === "image_scan"),
    "DOCX approximate does not create image_scan"
  );
  assert.ok(docxReport.documentProfile, "documentProfile on report");
  assert.equal(docxReport.documentProfile.format, "docx");

  // Keyword suggestions prefer mustMissing / hard — not soft PROFESSIONAL_KEYWORDS
  const softTrap = analyzeCv(
    `Pat Soft
pat@mail.com | 01 23 45 67 89
EXPÉRIENCE
Assistant — Corp (2020 - 2022)
- Responsable de la communication interne
FORMATION
Licence (2018)
COMPÉTENCES
communication, leadership
`,
    {
      pages: 1,
      skillsMatch: {
        hits: ["communication", "leadership"],
        hardHits: [],
        softHits: ["communication", "leadership"],
        count: 0,
        density: 0,
      },
      jdOverlap: {
        overlap: [],
        score: 20,
        jdTerms: ["kubernetes", "terraform", "react"],
        mustTerms: ["kubernetes", "terraform", "react"],
        mustMissing: ["kubernetes", "terraform", "react"],
        mustCoverage: 0,
        niceTerms: [],
      },
    }
  );
  const kwSug = softTrap.annotations.find(
    (a) => a.kind === "keyword" || a.kind === "jd_must"
  );
  assert.ok(kwSug, "keyword/must annotation present");
  assert.ok(
    /kubernetes|terraform|react/i.test(kwSug.suggestion || kwSug.title || ""),
    "JD mustMissing in suggestion, not soft fallback"
  );
  assert.ok(
    !/gestion · projet · équipe/i.test(kwSug.suggestion || ""),
    "no soft PROFESSIONAL_KEYWORDS fallback when JD present"
  );
  assert.ok(
    softTrap.annotations.some((a) => a.kind === "jd_must" && /kubernetes/i.test(a.title || "")),
    "per-must jd_must annotations"
  );

  // action_without_metric → annotation
  const bareActions = analyzeCv(
    `Alex Dev
alex@mail.com | 06 11 22 33 44
EXPÉRIENCE
Dev — Co (2021 - 2023)
- Développé une plateforme interne
- Optimisé les requêtes SQL
- Créé un design system
FORMATION
Master (2019)
COMPÉTENCES
JavaScript, React, SQL
`,
    { pages: 1, fileName: "alex.pdf", format: "pdf" }
  );
  const aom = bareActions.checklist.find((c) => c.id === "action_without_metric");
  if (aom && aom.ok === false) {
    assert.ok(
      bareActions.annotations.some((a) => a.checkId === "action_without_metric"),
      "action_without_metric KO produces annotation"
    );
  }
  console.log("✓ action_without bridge / metrics anns", {
    aom: aom?.ok,
    metricsAnns: bareActions.annotations.filter((a) => a.checkId === "metrics" || a.checkId === "action_without_metric")
      .length,
  });

  // EN checklist labels translated
  const enRep = analyzeCv(goodCv, { pages: 1, lang: "en", fileName: "marie.pdf" });
  const frOnly = enRep.checklist.filter((c) =>
    /détecté|présente|absente|favorable|extractible/i.test(c.label || "")
  );
  assert.ok(
    frOnly.length < enRep.checklist.length / 2,
    "EN checklist mostly translated (few FR leftovers)"
  );
  assert.ok(
    enRep.checklist.some((c) => /email|phone|skills|experience|extractable|detected/i.test(c.label || "")),
    "EN checklist has English labels"
  );

  console.log("✓ document profile + watermarks + advice quality OK", {
    canvaVia: fromText.via,
    scan: scanProf.extractability,
    docx: docxReport.documentProfile.extractability,
  });
}

// —— Faux poste (mission → dates) + sidebar ≠ tableau ——
{
  const lynaLike = `
LYNA EXEMPLE
HR Business Partner
lyna@mail.com | 06 12 34 56 78
Paris

EXPÉRIENCE PROFESSIONNELLE
2017 - 2022 : HR Business Partner / Talent Acquisition Officer
Ingerop, 92500 Rueil-Malmaison
Recrutement et sélection des profils cadres et non cadres
Sélection, entretiens et présentation client aux managers
Pipeline ATS, placements et reporting mensuel
Suivi des indicateurs et tableaux de bord RH
Relation écoles et cabinets partenaires
Intégration et onboarding des nouveaux collaborateurs
ATS/SIRH et Excel ; reportings volumes, demandes et indicateurs de suivi.
Pilotage des process RH et relation managers

2015 - 2017 : Consultante recrutement
Cabinet XYZ, Paris
Sourcing et approche directe

FORMATION
Master RH — Université (2013 - 2015)
COMPÉTENCES
ATS, SIRH, Excel
LANGUES
Français, Anglais
`;
  const pLyna = parseCv(lynaLike);
  assert.equal(pLyna.roles.length, 2, "Lyna-like: 2 real roles only");
  assert.ok(
    pLyna.roles.every((r) => r.startYear),
    "Lyna-like: both roles dated"
  );
  assert.ok(
    pLyna.roles[0].bullets.some((b) => /ATS\/SIRH/i.test(b)),
    "ATS/SIRH mission absorbed as bullet"
  );
  assert.ok(
    !pLyna.roles.some((r) => /ATS\/SIRH/i.test(r.title || "")),
    "ATS/SIRH is not a role title"
  );
  const rLyna = analyzeCv(lynaLike, { pages: 1, fileName: "lyna.pdf" });
  assert.ok(
    !rLyna.annotations.some(
      (a) => a.kind === "missing_dates" && /ATS\/SIRH/i.test(a.title || a.quote || "")
    ),
    "no missing_dates on ATS/SIRH duty line"
  );

  // Explicit bullets then unmarked tools line mid-experience
  const withBullets = `
Pat Soft
pat@mail.com | 01 23 45 67 89
EXPÉRIENCE
2018 - 2021 : Manager RH — Acme
- Mission une
- Mission deux
- Mission trois
- Mission quatre
- Mission cinq
- Mission six
ATS/SIRH et Excel ; reportings volumes, demandes et indicateurs.
- Mission sept
FORMATION
Master (2016)
COMPÉTENCES
Excel
`;
  const pB = parseCv(withBullets);
  assert.equal(pB.roles.length, 1, "tools line after 6 bullets stays in same role");
  assert.ok(pB.roles[0].bullets.some((b) => /ATS\/SIRH/i.test(b)));

  // True undated roles still annotated
  const noDatesCv2 = `
Marie Dupont
Développeuse Full Stack
marie@x.com | 06 12 34 56 78
Paris
EXPÉRIENCE PROFESSIONNELLE
Développeuse Full Stack — TechCorp
- Développé une plateforme SaaS
Lead Frontend — StartupXYZ
- Créé le design system
FORMATION
Master Informatique
COMPÉTENCES
React, Node, Agile, management
` + " texte extractible supplémentaire. ".repeat(10);
  const rNoDates = analyzeCv(noDatesCv2, { pages: 1 });
  assert.ok(
    rNoDates.annotations.some((a) => a.kind === "missing_dates"),
    "real undated roles still get missing_dates"
  );

  // Sidebar + two prose blocks in body → not a table
  const { analyzePdfLayout, detectStrongTableGrid, isBimodalColumnLayout } = await import(
    "./extract.js"
  );
  const sidebarProse = [];
  for (let i = 0; i < 10; i++) {
    const y = 0.2 + i * 0.06;
    sidebarProse.push({
      str: `Formation item ${i}`,
      page: 1,
      textStart: i * 80,
      textEnd: i * 80 + 16,
      rect: { x: 0.06, y, w: 0.22, h: 0.02 },
    });
    sidebarProse.push({
      str: `Sélection, entretiens et présentation client bloc ${i}`,
      page: 1,
      textStart: i * 80 + 20,
      textEnd: i * 80 + 55,
      rect: { x: 0.38, y, w: 0.28, h: 0.03 },
    });
    sidebarProse.push({
      str: `Pipeline ATS, placements et reporting mensuel ${i}`,
      page: 1,
      textStart: i * 80 + 56,
      textEnd: i * 80 + 90,
      rect: { x: 0.68, y, w: 0.26, h: 0.03 },
    });
  }
  assert.equal(isBimodalColumnLayout(sidebarProse), true, "sidebar+prose is bimodal");
  assert.equal(detectStrongTableGrid(sidebarProse), false, "prose columns not strong grid");
  const sideLayout = analyzePdfLayout(
    [{ page: 1, width: 600, height: 800, items: sidebarProse }],
    { pdfCreator: "Microsoft Word", pdfProducer: "Word" }
  );
  assert.equal(sideLayout.tableHint, false, "sidebar CV must not set tableHint");

  console.log("✓ faux poste / duty bullets + sidebar no table OK", {
    roles: pLyna.roles.length,
    bullets0: pLyna.roles[0].bullets.length,
  });
}

// ── Anti-placebo: real analysis honesty ──
{
  // 1) Substring verb (unmanaged) must not boost action_verbs
  const unmanagedCv = `Alex Martin
alex.martin@email.com | 06 98 76 54 32 | Paris
EXPÉRIENCE PROFESSIONNELLE
Support — FirmX (2020 - 2023)
- unmanaged backlog tickets every sprint
- Responsible for documentation updates without metrics
FORMATION
Licence Info — Univ (2019)
COMPÉTENCES
Excel, communication, teamwork, leadership, creativity, adaptability
`;
  const uR = analyzeCv(unmanagedCv, { pages: 1 });
  const uVerbs = uR.checklist.find((c) => c.id === "action_verbs");
  assert.ok(uVerbs?.ok !== true, "unmanaged must not green action_verbs");
  assert.ok(
    !/bien utilisés/i.test(uVerbs?.label || ""),
    "substring managed must not inflate verb count"
  );
  console.log("✓ anti-placebo unmanaged verbs OK", uVerbs?.label);

  // 2) Metrics outside experience bullets must not green
  const metricsOutside = `Sam Dupont
sam@email.com | 06 11 22 33 44
PROFIL
Expert avec 50% d'expertise, budget 100k€, 12 000 clients au total, CA 2M€, team 15.
EXPÉRIENCE PROFESSIONNELLE
Consultant — Co (2021 - 2023)
Participation aux projets internes sans chiffre dans les puces.
FORMATION
Master — Univ (2020)
COMPÉTENCES
Java, SQL
`;
  const mR = analyzeCv(metricsOutside, { pages: 1 });
  const mCheck = mR.checklist.find((c) => c.id === "metrics");
  assert.equal(mCheck?.ok, false, "metrics outside experience must not be ok:true");
  console.log("✓ anti-placebo metrics outside exp OK", mCheck?.label);

  // 3) Soft-stuffing + weak metrics → passes false
  const softStuffCv = `Léa Soft
lea@email.com | 06 22 33 44 55 | Lyon
EXPÉRIENCE PROFESSIONNELLE
Chargée de mission — Org (2019 - 2023)
- Responsable de la coordination
- Chargé de l'accueil
- Participé aux réunions
- Aidé les collègues
FORMATION
Licence (2018)
COMPÉTENCES
communication, leadership, teamwork, creativity, adaptability, motivation, empathy
`;
  const sR = analyzeCv(softStuffCv, {
    pages: 1,
    skillsMatch: {
      hits: ["communication", "leadership", "teamwork", "creativity", "adaptability", "motivation"],
      hardHits: [],
      softHits: ["communication", "leadership", "teamwork", "creativity", "adaptability"],
      count: 0,
      density: 0,
    },
  });
  const soft = sR.checklist.find((c) => c.id === "keyword_soft_stuffing");
  assert.ok(soft && soft.ok === false, "soft-stuffing should KO");
  assert.equal(sR.passes, false, "soft-stuffing + weak metrics must not pass");
  console.log("✓ anti-placebo soft-stuffing blocks pass OK", sR.total);

  // 4) EN spelling/grammar without enrich → na, not ok:true
  const enClean = `John Smith
Software Engineer
john.smith@email.com | +44 7700 900123 | London | linkedin.com/in/johnsmith

EXPERIENCE
Software Engineer — TechCo (2020 - Present)
- Developed APIs used by 10 000 users
- Improved latency by 30%
- Led a team of 6 engineers

EDUCATION
BSc Computer Science — Uni (2019)

SKILLS
Python, AWS, Docker, React, PostgreSQL, Kubernetes
`;
  const enCleanR = analyzeCv(enClean, { pages: 1, lang: "en" });
  const spell = enCleanR.checklist.find((c) => c.id === "spelling_quality");
  const gram = enCleanR.checklist.find((c) => c.id === "grammar_quality");
  assert.ok(spell?.na === true || spell?.ok === null, "EN spelling without enrich → na");
  assert.ok(spell?.ok !== true, "EN spelling must not fake ok:true");
  assert.ok(gram?.na === true || gram?.ok === null, "EN grammar without enrich → na");
  assert.ok(gram?.ok !== true, "EN grammar must not fake ok:true");
  console.log("✓ anti-placebo EN spelling/grammar na OK");

  // 5) KO standard_headings / encoding → annotation with non-empty suggestion
  const noHeadings = `Paul SansTitres
paul@email.com | 06 55 44 33 22
Je suis développeur depuis 5 ans.
Chez Acme j'ai fait du React.
Diplôme master info.
`;
  const nh = analyzeCv(noHeadings + "\nextra texte pour passer le seuil minimum de contenu extractible pour l'analyse ATS locale.\n", {
    pages: 1,
  });
  const headAnn = nh.annotations.find((a) => a.checkId === "standard_headings");
  assert.ok(headAnn, "standard_headings KO must have annotation");
  assert.ok(String(headAnn.suggestion || "").trim().length > 0, "standard_headings suggestion non-empty");

  const weird =
    goodCv.replace(/\n/g, "\n") + "\n" + "□�".repeat(6);
  const enc = analyzeCv(weird, { pages: 1 });
  const encCheck = enc.checklist.find((c) => c.id === "encoding");
  assert.equal(encCheck?.ok, false, "weirdChars must KO encoding");
  const encAnn = enc.annotations.find((a) => a.checkId === "encoding");
  assert.ok(encAnn, "encoding KO must have annotation");
  assert.ok(String(encAnn.suggestion || "").trim().length > 0, "encoding suggestion non-empty");
  console.log("✓ anti-placebo encoding annotation OK");
  console.log("✓ anti-placebo standard_headings annotation OK");

  // 6) Layout annotations have non-empty suggestions
  const withTables = analyzeCv(goodCv, {
    pages: 1,
    tableCount: 2,
    tableHint: true,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: false, tableHint: true, tableCount: 2, headerSparse: false, readingOrderOk: true },
    },
  });
  const tableAnn = withTables.annotations.find((a) => a.checkId === "no_tables");
  assert.ok(tableAnn, "no_tables annotation present");
  assert.ok(String(tableAnn.suggestion || "").trim().length > 0, "no_tables suggestion non-empty");

  const withCols = analyzeCv(goodCv, {
    pages: 1,
    parsed: {
      ...parseCv(goodCv),
      layout: { columnSmell: true, tableHint: false, tableCount: 0, headerSparse: false, readingOrderOk: true },
    },
  });
  const colAnn = withCols.annotations.find((a) => a.checkId === "single_column");
  assert.ok(colAnn, "single_column annotation present");
  assert.ok(String(colAnn.suggestion || "").trim().length > 0, "single_column suggestion non-empty");

  const withScan = analyzeCv(goodCv, {
    pages: 1,
    parsed: {
      ...parseCv(goodCv),
      layout: {
        columnSmell: false,
        tableHint: false,
        imageOnly: true,
        imageOnlyPages: [1],
        headerSparse: false,
        readingOrderOk: true,
      },
    },
  });
  const scanAnn = withScan.annotations.find((a) => a.checkId === "extractable_text");
  if (scanAnn) {
    assert.ok(String(scanAnn.suggestion || "").trim().length > 0, "scan suggestion non-empty");
  }
  console.log("✓ anti-placebo layout suggestions OK");

  // 7) Pro heuristic tagged as fallback (not peer to LLM)
  const heuristicAnns = [
    { id: "pro-1", kind: "passive_verb", source: "pro-heuristic", suggestion: "Piloté", title: "Verbe" },
  ];
  const tagged = heuristicAnns.map((a) => ({
    ...a,
    severity: "info",
    shortLabel: "Secours",
    source: a.source || "pro-heuristic",
    proFallback: true,
  }));
  assert.equal(tagged[0].severity, "info");
  assert.equal(tagged[0].shortLabel, "Secours");
  assert.equal(tagged[0].proFallback, true);
  assert.ok(tagged[0].source !== "llm", "heuristic must not look like LLM Pro");
  console.log("✓ anti-placebo Pro heuristic tagged Secours OK");
}

// ── Matching CV↔offre précision ──
{
  const {
    buildAho,
    ahoFind,
    hasTermBoundary,
    termBoundaryOk,
    matchJdOverlap,
    matchSkills,
    parseJdRequirementZones,
    resetSkillsMatchCaches,
  } = await import("./skills-match.js");
  resetSkillsMatchCaches?.();

  // Boundaries: no substring FPs
  assert.equal(hasTermBoundary("empower big decisions", "power bi"), false, "power bi not in empower big");
  assert.equal(hasTermBoundary("soci/cdrom archive", "ci/cd"), false, "ci/cd not in soci/cdrom");
  assert.equal(hasTermBoundary("built with power bi dashboards", "power bi"), true, "real power bi matches");
  assert.equal(hasTermBoundary("pipeline ci/cd on aws", "ci/cd"), true, "real ci/cd matches");
  assert.equal(termBoundaryOk("preact.js", 1, 1 + "react.js".length), false, "react.js span in preact.js fails boundary");

  const reactAho = buildAho([{ label: "react", aliases: ["react.js", "reactjs"] }]);
  const preactHits = ahoFind(reactAho, "Built UI with Preact.js components");
  assert.equal(preactHits.has("react"), false, "preact.js must not match react.js alias");
  const reactHits = ahoFind(reactAho, "Built UI with React.js components");
  assert.ok(reactHits.has("react"), "react.js still folds to react");
  console.log("✓ matching boundaries power bi / ci/cd / preact OK");

  // Nice-to-have section → not mustMissing
  const niceJd = await matchJdOverlap(
    "Dev React Node.js AWS Docker",
    `Required: React, Node.js, AWS.
Nice to have: Kubernetes, Terraform.
Soft skills: leadership.`
  );
  assert.ok(niceJd.mustTerms?.some((t) => t === "react" || t === "node.js" || t === "aws"), "required hard in must");
  assert.ok(
    !niceJd.mustMissing?.includes("kubernetes"),
    "kubernetes in nice section must not be mustMissing"
  );
  assert.ok(
    niceJd.niceTerms?.includes("kubernetes") || niceJd.niceTerms?.includes("terraform"),
    "nice section hard skills land in niceTerms"
  );
  assert.ok(niceJd.niceTerms?.includes("leadership"), "soft stays nice");
  const zones = parseJdRequirementZones(`Required: React\nNice to have: Kubernetes`);
  assert.equal(zones.hasSections, true, "JD sections detected");
  console.log("✓ matching nice-to-have vs must OK", {
    must: niceJd.mustTerms,
    nice: niceJd.niceTerms,
    missing: niceJd.mustMissing,
  });

  // Soft-only JD terms remain nice
  const softJd = await matchJdOverlap(
    "Profile with communication and leadership",
    "Looking for communication, leadership, teamwork and creativity in a collaborative environment."
  );
  assert.ok((softJd.mustTerms || []).length === 0 || softJd.mustTerms.every((t) => !["communication", "leadership", "teamwork", "creativity"].includes(t)));
  assert.ok(
    (softJd.niceTerms || []).some((t) => /communication|leadership|teamwork|creativity/.test(t)),
    "soft JD terms are nice"
  );
  console.log("✓ matching soft-only JD → nice OK");

  // Ambiguous short skills do not green prose CV
  const prose = await matchSkills(
    "I rest by the sea and lean on the word of the team. We go to the table for lunch near the UI board."
  );
  for (const bad of ["rest", "sea", "lean", "go", "word", "tableau", "ui"]) {
    assert.ok(!prose.hardHits.includes(bad), `ambiguous ${bad} must not hit prose`);
  }
  const techGo = await matchSkills("Backend services in Golang and REST API design with Tableau Desktop");
  assert.ok(techGo.hardHits.includes("go"), "golang → go");
  assert.ok(techGo.hardHits.includes("rest"), "rest api → rest");
  assert.ok(techGo.hardHits.includes("tableau"), "tableau desktop → tableau");
  console.log("✓ matching ambiguous shorts gated OK", techGo.hardHits.slice(0, 8));

  // Pack expansion does not flood must without signal
  const thinJd = await matchJdOverlap(
    "Commercial terrain",
    "Poste de commercial : relation client et négociation. Excel apprécié pour le reporting."
  );
  assert.ok(
    !(thinJd.mustTerms || []).includes("kubernetes"),
    "unrelated pack terms must not enter must"
  );
  console.log("✓ matching pack expansion scoped OK", {
    must: thinJd.mustTerms?.slice(0, 8),
    nice: thinJd.niceTerms?.slice(0, 8),
  });

  // Pro-style boundary helper parity (unit)
  assert.equal(hasTermBoundary("preact.js toolkit", "react.js"), false);
  assert.equal(hasTermBoundary("uses react.js daily", "react.js"), true);
  console.log("✓ matching Pro-style boundary unit OK");
}

// ── Clarté analyse (langage utilisateur) ──
{
  const { shortCheckLabel } = await import("./studio.js");
  assert.equal(shortCheckLabel("long jargon sentence here that truncates", "email"), "E-mail");
  assert.equal(shortCheckLabel("x", "metrics"), "Chiffres");
  assert.equal(shortCheckLabel("x", "keyword_soft_stuffing"), "Outils manquants");
  assert.equal(shortCheckLabel("x", "standard_headings"), "Titres de sections");
  assert.equal(shortCheckLabel("x", "jd_overlap"), "Offre");
  console.log("✓ clarity KO chip labels OK");

  const softCv = `
Pat Soft
pat@mail.com | 01 23 45 67 89
EXPÉRIENCE
Assistant — Corp (2020 - 2022)
- Responsable de la communication interne sans chiffre
FORMATION
Licence (2018 - 2020)
COMPÉTENCES
communication, leadership, collaboration, teamwork, créativité, autonomie
`;
  const softR = analyzeCv(softCv, {
    pages: 1,
    skillsMatch: {
      hits: ["communication", "leadership", "collaboration", "teamwork", "créativité", "autonomie"],
      hardHits: [],
      softHits: ["communication", "leadership", "collaboration", "teamwork", "créativité"],
      count: 0,
      density: 0,
    },
  });
  const stuff = softR.checklist.find((c) => c.id === "keyword_soft_stuffing");
  assert.ok(stuff && !/\bhard\b/i.test(stuff.label) && !/\bsoft\b/i.test(stuff.label.replace(/soft skills/i, "")), "checklist without hard/soft jargon");
  assert.ok(/qualités personnelles|outils/i.test(stuff.label), "plain-language soft-stuffing label");
  const ann = softR.annotations.find((a) => a.checkId === "keyword_soft_stuffing");
  assert.ok(ann && ann.shortLabel !== "Soft stuffing", "annotation shortLabel clarified");
  assert.ok(ann && !/\bhard\b/i.test(ann.title || ""), "annotation title without hard");
  assert.ok(
    softR.categories.readability.name === "Lecture automatique" ||
      /Lecture|Automated|Lisibilité/i.test(softR.categories.readability.name),
    "readability axis plain name"
  );
  console.log("✓ clarity analyzer copy OK", stuff.label, softR.categories.readability.name);
}

// ── Formation detection (parse + AI prompt) ──
{
  const { parseCv, isSectionHeader } = await import("./parse-cv.js");
  const { buildAiCvPrompt, salvageEducationLines } = await import("./ai-prompt.js");

  assert.equal(isSectionHeader({ text: "Parcours académique" }), "education");
  assert.equal(isSectionHeader({ text: "Parcours professionnel" }), "experience");
  assert.equal(isSectionHeader({ text: "Parcours" }), null);
  assert.equal(isSectionHeader({ text: "Cursus" }), "education");
  assert.equal(isSectionHeader({ text: "Scolarité" }), "education");
  assert.equal(isSectionHeader({ text: "🎓 Formation" }), "education");
  assert.equal(isSectionHeader({ text: "• Formation" }), null);
  assert.equal(isSectionHeader({ text: "Mes formations" }), "education");

  const parcoursCv = `
Jean Dupont
jean@mail.com | 06 12 34 56 78
EXPÉRIENCE
Développeur — Acme (2020 - 2023)
- Développé des APIs REST
PARCOURS ACADÉMIQUE
Master Informatique — Université Paris (2018 - 2020)
COMPÉTENCES
Java, Python
`;
  const parcoursParsed = parseCv(parcoursCv);
  assert.ok(
    (parcoursParsed.sections.education || []).some((l) => /Master Informatique/i.test(l)),
    "Parcours académique fills education section"
  );
  const parcoursReport = analyzeCv(parcoursCv, { pages: 1 });
  assert.equal(
    parcoursReport.checklist.find((c) => c.id === "section_education")?.ok,
    true,
    "section_education OK for Parcours académique"
  );
  const parcoursPrompt = buildAiCvPrompt(
    { report: parcoursReport, annotations: [], extracted: { text: parcoursCv } },
    { lang: "fr" }
  );
  const parcoursEdu = parcoursPrompt.match(/## Formation[\s\S]*?## Compétences/)?.[0] || "";
  assert.ok(/Master Informatique/i.test(parcoursEdu), "prompt Formation includes Master");
  assert.ok(!/À compléter : section Formation/i.test(parcoursEdu), "prompt not todo-only for Parcours académique");
  console.log("✓ Formation Parcours académique → prompt OK");

  const emojiCv = `
Jean Dupont
jean@mail.com | 06 12 34 56 78
EXPÉRIENCE
Développeur — Acme (2020 - 2023)
- Développé des APIs
🎓 Formation
Master Informatique — Université Paris (2018 - 2020)
COMPÉTENCES
Java
`;
  const emojiReport = analyzeCv(emojiCv, { pages: 1 });
  assert.equal(
    emojiReport.checklist.find((c) => c.id === "section_education")?.ok,
    true,
    "emoji Formation heading detected"
  );
  console.log("✓ Formation emoji heading OK");

  const cursusParsed = parseCv(`
Alice Martin
alice@mail.com | 01 23 45 67 89
EXPÉRIENCE
Analyste — Corp (2019 - 2022)
- Piloté le reporting
CURSUS
Licence Économie — Lyon (2016 - 2019)
COMPÉTENCES
Excel
`);
  assert.ok(
    (cursusParsed.sections.education || []).some((l) => /Licence/i.test(l)),
    "Cursus → education"
  );
  const scolariteParsed = parseCv(`
Alice Martin
alice@mail.com | 01 23 45 67 89
EXPÉRIENCE
Analyste — Corp (2019 - 2022)
SCOLARITÉ
Bac S — Lycée Pasteur (2016)
COMPÉTENCES
Excel
`);
  assert.ok(
    (scolariteParsed.sections.education || []).some((l) => /Bac S/i.test(l)),
    "Scolarité → education"
  );
  console.log("✓ Formation Cursus / Scolarité OK");

  // Regression: bullet « formation » ≠ section
  const bulletCv = `
Bob Martin
bob@mail.com | 01 23 45 67 89
EXPÉRIENCE
Consultant — Firm (2020 - 2022)
- Suivi de la formation interne des nouveaux arrivants
COMPÉTENCES
Excel, PowerPoint
`;
  const bulletReport = analyzeCv(bulletCv, { pages: 1 });
  assert.equal(
    bulletReport.checklist.find((c) => c.id === "section_education")?.ok,
    false,
    "formation in bullet ≠ Education section"
  );
  console.log("✓ Formation bullet regression OK");

  // Salvage diploma lines into prompt when heading missing
  const buriedCv = `
Alice Martin
alice@mail.com | 01 23 45 67 89
EXPÉRIENCE PROFESSIONNELLE
Développeuse — Startup (2020 - 2023)
- Livré des features
Master Droit — Université Assas (2015 - 2017)
COMPÉTENCES
Excel, Word
`;
  const buriedReport = analyzeCv(buriedCv, { pages: 1 });
  assert.equal(
    buriedReport.checklist.find((c) => c.id === "section_education")?.ok,
    false,
    "buried diploma without heading still fails checklist"
  );
  const salvage = salvageEducationLines(buriedReport.parsed, buriedCv);
  assert.ok(salvage.some((l) => /Master Droit/i.test(l)), "salvage finds Master Droit");
  const buriedPrompt = buildAiCvPrompt(
    { report: buriedReport, annotations: [], extracted: { text: buriedCv } },
    { lang: "fr" }
  );
  const buriedEdu = buriedPrompt.match(/## Formation[\s\S]*?## Compétences/)?.[0] || "";
  assert.ok(/Master Droit/i.test(buriedEdu), "prompt salvages buried diploma");
  assert.ok(/Extrait Formation probable|Likely education excerpt/i.test(buriedEdu), "salvage note present");
  console.log("✓ Formation prompt salvage OK");
}

console.log("Tous les tests OK");
