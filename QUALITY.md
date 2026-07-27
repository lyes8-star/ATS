# Exigences qualité & sécurité

Barre commune reprise des repos **Test** (Crevia) et **Test2** (Procept).

## Skills Impeccable

| Emplacement | Rôle |
|-------------|------|
| [`.cursor/skills/impeccable/`](.cursor/skills/impeccable/) | Skill agent Cursor (`audit`, `harden`, `polish`, `craft`…) |
| [`.cursor/hooks.json`](.cursor/hooks.json) | `preToolUse` → bloque les écritures UI avec anti-patterns |
| [`.github/skills/impeccable/`](.github/skills/impeccable/) | Même skill pour Copilot / CI agents |
| [`.github/hooks/impeccable.json`](.github/hooks/impeccable.json) | Hook post-edit GitHub |
| [`.impeccable/config.json`](.impeccable/config.json) | Detector + ignores projet |
| [`PRODUCT.md`](PRODUCT.md) / [`DESIGN.md`](DESIGN.md) | Contexte produit & design system |

Commandes utiles :

```bash
npm run detect          # scan anti-patterns Impeccable
npm run audit:static    # checklist fichiers / RGPD / PWA / headers
npm run audit           # tests moteur + audit:static
```

Dans Cursor : `/impeccable audit`, `/impeccable harden`, `/impeccable polish`, `/impeccable hooks status`.

## Qualité (audit)

Dimensions imposées (réf. `reference/audit.md`) :

1. Accessibilité (WCAG 2.2 / RGAA)
2. Performance
3. Responsive
4. Theming / tokens
5. Anti-patterns « AI slop »

## Sécurité & conformité

| Exigence | Implémentation |
|----------|----------------|
| Consent Mode v2 deny-by-default | `js/consent.js` |
| Tags SEA seulement après opt-in | `js/analytics.js` |
| Pas d’upload CV par défaut | analyse locale ; Extrait / Pro uniquement après case à cocher |
| Enrichissement Extrait | `ats_enrich_consent_v1` — texte/image d’en-tête via Worker (LT, géocode, photo) |
| Mode Pro | `ats_pro_consent_v1` — LLM / ESCO / PDF (+ Extrait) |
| Headers (nosniff, XFO, Referrer, Permissions-Policy) | `_headers` |
| security.txt | `.well-known/security.txt` |
| Soft anti-copie (off en a11y) | `js/protect.js` |
| Mentions LCEN / RGPD / cookies / a11y | pages légales |

## Harden

Réf. `reference/harden.md` : empty states, erreurs fichier, offline PWA, overflow texte, formulaires, i18n space budget (FR).
