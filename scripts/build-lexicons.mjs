/**
 * Génère / valide les lexiques d'analyse (offline).
 * Usage: node scripts/build-lexicons.mjs
 *
 * Les JSON sous data/analysis/ sont commités. Ce script vérifie l'intégrité
 * et peut enrichir skills-fr-en.min.json depuis une source locale si fournie.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "data", "analysis");

const required = [
  "skills-fr-en.min.json",
  "action-verbs.fr.json",
  "action-verbs.en.json",
  "ats-layout-rules.json",
  "tech-whitelist.json",
  "keywords-by-role.json",
];

let ok = true;
for (const f of required) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) {
    console.error("Missing", f);
    ok = false;
    continue;
  }
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  if (f.startsWith("skills") && !(data.skills?.length > 50)) {
    console.error("skills lexicon too small", data.skills?.length);
    ok = false;
  }
  if (f.includes("action-verbs") && !(data.strong?.length > 10)) {
    console.error("verbs lexicon incomplete", f);
    ok = false;
  }
  console.log("✓", f, f.startsWith("skills") ? `(${data.skills.length} skills)` : "");
}

// Dedupe + sort skills
const skillsPath = path.join(dir, "skills-fr-en.min.json");
const skillsData = JSON.parse(fs.readFileSync(skillsPath, "utf8"));
const uniq = [...new Set(skillsData.skills.map((s) => String(s).toLowerCase().trim()).filter(Boolean))].sort();
skillsData.skills = uniq;
skillsData.builtAt = new Date().toISOString();
fs.writeFileSync(skillsPath, JSON.stringify(skillsData, null, 2) + "\n");
console.log("Normalized skills →", uniq.length);

if (!ok) process.exit(1);
console.log("Lexicons OK");
