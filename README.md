# Test Mon CV

Analyseur de compatibilité ATS pour CV (PDF / DOCX) — site statique aux normes production (PWA, SEO, SEA, RGPD FR, accessibilité, chatbot).

## Lancer

```bash
python3 -m http.server 8080
```

Ouvrir http://localhost:8080/

> Les modules ES, PDF.js et le service worker nécessitent HTTP (pas `file://`).

## Fonctionnalités produit

- Upload PDF / DOCX — analyse **locale par défaut** (aucun envoi sans case Extrait / Pro)
- **Rapport détaillé** après analyse ; atelier = suggestions à copier
- Score /100 + 4 axes ; parse structuré, lexiques, overlap offre
- **Rapport + correctifs** — l’utilisateur modifie son CV lui-même (pas d’export produit)
- **Enrichissement Extrait** opt-in : LanguageTool, géocode, classification photo (extrait)
- **Mode Pro** opt-in : Worker Cloudflare (LLM annotations, ESCO, PDF reflow + Extrait)
- **Retest automatique** avec delta de score
- Domaine : `https://www.testmoncv.fr/` — i18n FR/EN, PWA / RGPD / a11y

## Normes production (modèle Test / Test2)

| Domaine | Implémentation |
|---------|----------------|
| **PWA** | `manifest.webmanifest`, `sw.js`, `offline.html`, icons, bannière install |
| **SEO** | meta OG/Twitter, `robots.txt`, `sitemap.xml`, JSON-LD (`js/seo.js`) |
| **SEA** | GA4 + Google Ads via `js/analytics.js` — **uniquement après consentement** |
| **RGPD / ePrivacy** | CMP `js/consent.js` + Consent Mode v2 (deny by default) |
| **Pages légales** | Mentions (LCEN), Confidentialité, Cookies, Accessibilité (RGAA/EAA) |
| **Accessibilité** | skip link, FAB préférences (`js/a11y.js`), ARIA dialogues |
| **Chatbot** | Assistant FAQ flottant (`js/chat.js`) |

### Brancher GA4 / Google Ads

Éditer [`data/site.json`](data/site.json) :

```json
"gaId": "G-XXXXXXXXXX",
"adsId": "AW-XXXXXXXXX"
```

Les tags ne se chargent qu’après acceptation analytics/ads dans le bandeau cookies.

### Mentions légales

Compléter SIRET, forme juridique, adresse et hébergeur dans `data/site.json` → `legal` et dans `mentions-legales/index.html`.

## Structure

```
index.html              # Accueil + analyseur + atelier
data/site.json          # Config marque / IDs SEA / légal
data/analysis/          # Lexiques compétences / verbes / règles ATS (offline)
js/analyzer.js          # Moteur de score approfondi + annotations
js/parse-cv.js          # Parse structuré (sections, rôles, dates)
js/skills-match.js      # Aho–Corasick + lexiques lazy
js/extract.js           # Extraction PDF (géométrie) / DOCX (HTML + tables)
js/annotate.js          # Overlays preview
js/studio.js            # UI atelier split + accept/ignore + exports
js/optimize.js          # Application des suggestions
js/export-cv.js         # Export CV ATS Clean 1 page (HTML)
js/export-reconstruct.js# DOCX reconstruit + download layout
js/export-docx.js       # DOCX in-place (PizZip)
js/pro-client.js        # Client Mode Pro + Extrait (consent + Worker)
workers/ats-pro/        # Cloudflare Worker LLM / ESCO / PDF
js/app.js               # Orchestration upload → studio → retest
js/consent.js           # CMP + Consent Mode v2
js/i18n.js              # dictionnaire FR/EN + switcher (pas de /en routes)
js/map-google.js        # popup Google Maps chargée après consentement CMP
js/analytics.js         # gtag gated
js/a11y.js / chat.js    # FABs accessibilité & assistant
sw.js / manifest…       # PWA
mentions-legales/ …     # Quartet légal
```

## Qualité & sécurité (skills Test / Test2)

Ce dépôt embarque la **même stack Impeccable** que Test2 :

- `.cursor/skills/impeccable` + hook Cursor `preToolUse`
- `.github/skills/impeccable` + hook GitHub Copilot
- `PRODUCT.md` / `DESIGN.md` / `QUALITY.md`
- Soft protect `js/protect.js`, headers `_headers`, `security.txt`

```bash
npm run audit          # tests moteur + checklist PWA/RGPD/sécurité
npm run audit:static
npm run detect         # anti-patterns Impeccable
```

Dans Cursor : `/impeccable audit`, `/impeccable harden`, `/impeccable polish`.

## Tests

```bash
node js/test-analyzer.mjs
```
