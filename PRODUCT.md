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

Outil gratuit **ATS Check** : analyser un CV (PDF/DOCX) **localement dans le navigateur**, produire un score de compatibilité ATS /100, un **atelier annoté** (surcouches précises + acceptation clic par clic), générer un **CV ATS 1 colonne**, puis **retester** automatiquement.

Succès = le visiteur dépose un CV, comprend son score, corrige les zones exactes dans l’atelier, télécharge un CV optimisé, et fait confiance à la confidentialité (pas d’upload serveur).

## Positioning

Vérificateur ATS gratuit, immédiat, respectueux de la vie privée — analyse 100 % navigateur + atelier de correction guidée.

## Conversion & proof

- **Primary CTA:** déposer / analyser mon CV.
- **Secondary CTAs:** ouvrir l’atelier annoté ; générer le CV ATS ; retester ; assistant FAQ ; pages légales / accessibilité.
- **Line a visitor remembers after 10 seconds:** Votre CV passe-t-il les filtres ATS ? Score en quelques secondes, corrections sur les zones exactes, sans envoyer le fichier.
- **Belief ladder:**
  1. L’outil est gratuit et immédiat.
  2. Mon CV ne quitte pas mon appareil.
  3. Le diagnostic m’indique quoi corriger — et **où** sur le CV.
  4. Je peux accepter les suggestions et retester mon score avant / après.
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

## Accessibility & Inclusion

Panneau d’accessibilité (contraste, taille de texte, soulignement, espacement, réduction de mouvement). Cibles : WCAG 2.2 AA / RGAA 4.1 / EAA. Skip link, focus visible, dialogues clavier.

## Quality & Security bar (Impeccable + Test/Test2)

Ce dépôt embarque les **mêmes skills Impeccable** que Test2 (`.cursor/skills/impeccable`, hooks Cursor + GitHub) et les exigences qualité/sécurité suivantes :

- Design detector hook sur edits UI (HTML/CSS/JS)
- Audit technique : a11y, perf, responsive, anti-patterns (`/impeccable audit`)
- Harden : erreurs, empty states, offline PWA (`/impeccable harden`)
- Sécurité : Consent Mode deny-by-default, pas d’upload CV, `security.txt`, headers recommandés, anti-copie soft (`js/protect.js`) désactivé en mode a11y
- Checklist PR + script `npm run audit:static`
