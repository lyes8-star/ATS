# ATS Check

Analyseur de compatibilité ATS pour CV (PDF / DOCX) — site statique aux normes production (PWA, SEO, SEA, RGPD FR, accessibilité, chatbot).

## Lancer

```bash
python3 -m http.server 8080
```

Ouvrir http://localhost:8080/

> Les modules ES, PDF.js et le service worker nécessitent HTTP (pas `file://`).

## Fonctionnalités produit

- Upload PDF / DOCX — analyse **100 % navigateur** (aucun CV envoyé au serveur)
- Score /100 + 4 axes /25 (lisibilité, structure, qualité, mots-clés)
- Diagnostic, points bloquants / forts, fautes d’orthographe courantes

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
index.html              # Accueil + analyseur
data/site.json          # Config marque / IDs SEA / légal
js/analyzer.js          # Moteur de score
js/app.js               # UI analyse
js/consent.js           # CMP + Consent Mode v2
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
