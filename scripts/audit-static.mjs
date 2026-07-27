/**
 * Audit qualité / sécurité statique — exigences Test / Test2.
 * Usage: node scripts/audit-static.mjs
 * Exit 0 = OK, 1 = échecs P0/P1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const warns = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function req(rel, msg) {
  if (!exists(rel)) fails.push(`P0 missing: ${rel} — ${msg}`);
}

function reqIncludes(rel, needle, msg, severity = "P1") {
  if (!exists(rel)) return;
  const txt = read(rel);
  if (!txt.includes(needle)) {
    const bucket = severity === "P0" ? fails : severity.startsWith("P2") ? warns : fails;
    bucket.push(`${severity} ${rel}: ${msg} (attendu: ${needle})`);
  }
}

// —— Structure Impeccable / skills (Test2) ——
req(".cursor/skills/impeccable/SKILL.md", "skill Impeccable Cursor");
req(".cursor/hooks.json", "hook preToolUse Cursor");
req(".github/skills/impeccable/SKILL.md", "skill Impeccable GitHub");
req(".github/hooks/impeccable.json", "hook GitHub Copilot");
req(".impeccable/config.json", "config detector");
req("PRODUCT.md", "contexte produit Impeccable");
req("DESIGN.md", "design system documenté");

// —— PWA / SEO / RGPD ——
[
  ["index.html", "entrée"],
  ["manifest.webmanifest", "PWA manifest"],
  ["sw.js", "service worker"],
  ["offline.html", "fallback offline"],
  ["robots.txt", "SEO robots"],
  ["sitemap.xml", "SEO sitemap"],
  [".well-known/security.txt", "security.txt"],
  ["js/consent.js", "CMP Consent Mode v2"],
  ["js/analytics.js", "analytics gated"],
  ["js/a11y.js", "panneau a11y"],
  ["js/chat.js", "chatbot"],
  ["js/protect.js", "protect soft"],
  ["_headers", "headers sécurité hébergeur"],
  ["mentions-legales/index.html", "LCEN"],
  ["confidentialite/index.html", "RGPD"],
  ["cookies/index.html", "cookies"],
  ["accessibilite/index.html", "déclaration a11y"],
  ["data/site.json", "config site"],
].forEach(([f, m]) => req(f, m));

// —— Contenu critique index ——
reqIncludes("index.html", "skip-link", "lien d’évitement accessibilité", "P0");
reqIncludes("index.html", "js/consent.js", "CMP chargé tôt", "P0");
reqIncludes("index.html", "manifest.webmanifest", "lien manifest PWA", "P0");
reqIncludes("index.html", "og:image", "Open Graph image", "P1");
reqIncludes("index.html", "data-manage-cookies", "lien gérer cookies", "P1");
reqIncludes("index.html", "js/protect.js", "protect branché", "P1");
reqIncludes("index.html", "lang=\"fr\"", "langue FR", "P0");

// —— Consent Mode deny-by-default ——
reqIncludes("js/consent.js", "analytics_storage: \"denied\"", "Consent Mode default denied", "P0");
reqIncludes("js/consent.js", "ad_storage: \"denied\"", "Ads storage denied by default", "P0");
reqIncludes("js/analytics.js", "canLoad()", "analytics gated par consent", "P0");

// —— Confidentialité analyse locale ——
reqIncludes("index.html", "locale", "rappel analyse locale", "P1");
reqIncludes("confidentialite/index.html", "n’est pas envoyé", "privacy: pas d’upload CV", "P0");

// —— Security headers file ——
reqIncludes("_headers", "X-Frame-Options: DENY", "anti-clickjacking", "P1");
reqIncludes("_headers", "X-Content-Type-Options: nosniff", "nosniff", "P1");
reqIncludes("_headers", "Referrer-Policy:", "referrer policy", "P1");

// —— Hooks pointent vers scripts existants ——
if (exists(".cursor/hooks.json")) {
  const h = read(".cursor/hooks.json");
  if (!h.includes("hook-before-edit.mjs")) fails.push("P0 .cursor/hooks.json: commande hook-before-edit manquante");
  if (!exists(".cursor/skills/impeccable/scripts/hook-before-edit.mjs")) {
    fails.push("P0 script hook-before-edit.mjs introuvable");
  }
}

console.log("=== ATS static quality & security audit ===\n");
if (fails.length) {
  console.log("FAILURES:");
  fails.forEach((f) => console.log("  ✗", f));
  console.log("");
}
if (warns.length) {
  console.log("WARNINGS:");
  warns.forEach((w) => console.log("  !", w));
  console.log("");
}

if (!fails.length && !warns.length) {
  console.log("✓ All checks passed\n");
} else if (!fails.length) {
  console.log(`✓ No P0/P1 failures (${warns.length} warnings)\n`);
}

console.log(`Summary: ${fails.length} fail(s), ${warns.length} warning(s)`);
process.exit(fails.length ? 1 : 0);
