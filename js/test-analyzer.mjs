/**
 * Tests du moteur ATS + annotations + optimize (Node)
 */
import { analyzeCv, attachGeometry } from "./analyzer.js";
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
assert.ok(after.total >= before.total - 5, `retest should not collapse (${before.total} → ${after.total})`);
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
  skillsMatch: { hits: ["javascript", "react", "aws", "docker", "agile", "python", "sql", "typescript", "node.js", "scrum", "management", "reporting"] },
});
assert.ok(withJd.categories.keywords.score >= 15);
assert.ok(withJd.jdOverlap?.score === 75);
console.log("✓ JD overlap scoring OK", withJd.categories.keywords.score);

const htmlFaithful = buildFaithfulHtml(goodCv, sampleParsed, { fileName: "marie.pdf" });
assert.ok(htmlFaithful.includes("Expérience") || htmlFaithful.includes("expérience") || htmlFaithful.includes("Experience"));
assert.ok(htmlFaithful.includes("<h1>"), "name as h1");
assert.ok(!/Généré par|ATS Check|score \d/i.test(htmlFaithful), "no tool branding in export");
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
  const { analyzePdfLayout } = await import("./extract.js");
  const layout = analyzePdfLayout([
    {
      page: 1,
      width: 600,
      height: 800,
      items: Array.from({ length: 24 }, (_, i) => ({
        str: i < 2 ? "x" : `Cell${i % 4}`,
        page: 1,
        textStart: i * 5,
        textEnd: i * 5 + 4,
        rect: {
          x: 0.1 + (i % 4) * 0.2,
          y: 0.2 + Math.floor(i / 4) * 0.08,
          w: 0.08,
          h: 0.02,
        },
      })),
    },
  ]);
  assert.equal(typeof layout.tableHint, "boolean");
  assert.equal(typeof layout.readingOrderOk, "boolean");
  console.log("✓ PDF layout heuristics OK", layout);
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

console.log("Tous les tests OK");
