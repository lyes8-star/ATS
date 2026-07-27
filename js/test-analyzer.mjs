/**
 * Tests du moteur ATS + annotations + optimize (Node)
 */
import { analyzeCv, attachGeometry } from "./analyzer.js";
import { applyAll } from "./optimize.js";
import { rectsForRange } from "./extract.js";
import assert from "node:assert/strict";

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
console.log("✓ Annotation verbe passif OK");

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

console.log("Tous les tests OK");
