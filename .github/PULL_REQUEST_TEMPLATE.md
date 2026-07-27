## Mise à jour ATS Check

### Checklist qualité (Impeccable / Test2)
- [ ] PRODUCT.md / DESIGN.md toujours cohérents avec le changement
- [ ] Pas de régression UI flagrante (hero, upload, résultats, FABs)
- [ ] Hook Impeccable / detector : pas de nouveaux anti-patterns non justifiés
- [ ] `npm run audit` (tests moteur + audit:static) OK

### Checklist sécurité / conformité FR
- [ ] CMP Consent Mode v2 inchangé (deny-by-default) si touché
- [ ] Analytics / Ads toujours gated derrière le consentement
- [ ] Aucun upload serveur de CV introduit
- [ ] Pages légales (mentions / confidentialité / cookies / accessibilité) à jour si besoin
- [ ] `_headers` / `security.txt` non cassés

### Checklist a11y
- [ ] Skip link, focus visible, dialogues clavier
- [ ] Mode a11y / `prefers-reduced-motion` respectés
- [ ] Zones tactiles FABs OK mobile

### Tests manuels
- [ ] `npm run serve` → upload PDF/DOCX → score affiché
- [ ] Refuser cookies → aucun appel `googletagmanager.com`
- [ ] Offline / PWA : `offline.html` joignable via SW après visite
