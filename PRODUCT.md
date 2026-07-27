# Product

## Register

brand

## Platform

web

## Users

**Primary:** candidats francophones (Junior à Senior) qui préparent des candidatures et veulent savoir si leur CV passe les filtres ATS avant envoi.

**Secondary:** coachs / cabinets RH qui testent rapidement la lisibilité ATS d’un CV.

Contexte typique : mobile ou desktop, première visite, besoin d’un score clair et d’actions concrètes en moins d’une minute.

## Product Purpose

Outil gratuit **ATS Check** : analyser un CV (PDF/DOCX) **localement dans le navigateur**, produire un score de compatibilité ATS /100 (analyse approfondie : géométrie, chronologie emploi, lexiques compétences, alignement offre), un **atelier annoté** (surcouches précises + acceptation clic par clic), générer un **CV optimisé fidèle à la mise en page** (DOCX in-place ou reconstruction structurée), avec une **version ATS linéaire** en option, puis **retester** automatiquement.

Succès = le visiteur dépose un CV, **atterrit directement dans l’atelier annoté**, accepte des corrections, télécharge un fichier **layout-fidèle**, reteste le score, et fait confiance à la confidentialité (pas d’upload serveur).

## Positioning

Vérificateur ATS gratuit, immédiat, respectueux de la vie privée — analyse 100 % navigateur + atelier de correction guidée.

## Conversion & proof

- **Primary CTA:** déposer / analyser mon CV → **ouvrir l’atelier annoté**.
- **Secondary CTAs:** voir le rapport détaillé ; télécharger le CV modifié ; version ATS linéaire ; retester ; assistant FAQ ; pages légales / accessibilité.
- **Line a visitor remembers after 10 seconds:** Votre CV à côté des zones à corriger — acceptez, générez, retestez. Sans envoyer le fichier.
- **Belief ladder:**
  1. L’outil est gratuit et immédiat.
  2. Mon CV ne quitte pas mon appareil.
  3. Je vois **où** corriger sur mon CV (pas seulement un rapport).
  4. J’accepte les suggestions, télécharge un CV **fidèle à ma mise en page**, et compare le score avant / après.
- **Proof on hand:** score jauge, atelier split-view, delta de score, export HTML/PDF — compléter `.impeccable/assets/proof/` si témoignages.

## Brand Personality

**clair · exigeant · rassurant**

Ton : professionnel, direct, sans jargon inutile. Émotions visées : contrôle, confiance, clarté.

## Anti-references

- Sites « IA génériques » (violet, gros gradients, cartes partout, glow).
- Outils RH opaques qui uploadent le CV sans explication.
- Paywalls agressifs avant le premier résultat.

## Design Principles

1. **Marque d’abord** — ATS Check lisible dès le premier viewport.
2. **Une idée par section** — hero = upload + promesse ; pas de clutter.
3. **Preuve par le score** — jauge + catégories, pas d’abstraction décorative.
4. **Confidentialité visible** — rappel « analyse locale » près de l’upload et dans le footer.
5. **Normes FR / UE** — CMP Consent Mode v2, pages LCEN/RGPD/cookies/a11y, PWA.
6. **Parité Crevia** — barre contact + popup Google Maps **chargée après consentement**, FR/EN i18n (pas de /en routes), typographie Space Grotesk / IBM Plex Sans, footer « Fait par Crevia ».

## Accessibility & Inclusion

Panneau d’accessibilité (contraste, taille de texte, soulignement, espacement, réduction de mouvement). Cibles : WCAG 2.2 AA / RGAA 4.1 / EAA. Skip link, focus visible, dialogues clavier.

## Quality & Security bar (Impeccable + Test/Test2)

Ce dépôt embarque les **mêmes skills Impeccable** que Test2 (`.cursor/skills/impeccable`, hooks Cursor + GitHub) et les exigences qualité/sécurité suivantes :

- Design detector hook sur edits UI (HTML/CSS/JS)
- Audit technique : a11y, perf, responsive, anti-patterns (`/impeccable audit`)
- Harden : erreurs, empty states, offline PWA (`/impeccable harden`)
- Sécurité : Consent Mode deny-by-default, pas d’upload CV, `security.txt`, headers recommandés, anti-copie soft (`js/protect.js`) désactivé en mode a11y
- Checklist PR + script `npm run audit:static`
