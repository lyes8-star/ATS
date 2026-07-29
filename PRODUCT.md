# Product

## Register

brand

## Platform

web

## Users

**Primary:** candidats francophones (Junior à Senior) qui préparent des candidatures et veulent savoir si leur CV est lisible par un logiciel de recrutement avant envoi.

**Secondary:** coachs / cabinets RH qui testent rapidement la lisibilité d’un CV.

Contexte typique : mobile ou desktop, première visite, besoin d’un score clair et d’actions concrètes en moins d’une minute.

## Product Purpose

Outil gratuit **Test Mon CV** (`https://www.testmoncv.fr/`) : analyser un CV (PDF/DOCX) **localement dans le navigateur** (par défaut), produire un **score /100** et un **rapport détaillé** avec **correctifs proposés** (à appliquer soi-même dans le fichier d’origine), avec options consenties :

- **Enrichissement Extrait** — Worker : LanguageTool, géocode Nominatim, classification photo vs logo (extrait uniquement, pas le fichier complet).
- **Mode Pro** — Worker : suggestions LLM + ESCO (pas d’export PDF produit).

Succès = le visiteur dépose un CV, lit le rapport, consulte les corrections proposées, **modifie son CV lui-même**, et choisit s’il active Extrait et/ou Mode Pro.

## Positioning

Contrôle de CV — immédiat, respectueux de la vie privée — analyse navigateur + correctifs à appliquer soi-même (pas d’export de CV).

## Conversion & proof

- **Primary CTA:** déposer / contrôler mon CV → **rapport détaillé**.
- **Secondary CTAs:** voir les corrections proposées ; aide FAQ ; pages légales / accessibilité.
- **Line a visitor remembers after 10 seconds:** Score + passages à corriger — vous gardez la main sur votre fichier.
- **Belief ladder:**
  1. L’outil est gratuit et immédiat.
  2. Mon CV ne quitte pas mon appareil.
  3. Je vois **où** corriger sur mon CV (pas seulement un score).
  4. Je copie les propositions et je modifie mon fichier d’origine.
- **Proof on hand:** score jauge, checklist, suggestions annotées — compléter `.impeccable/assets/proof/` si témoignages.

## Brand Personality

**clair · exigeant · rassurant**

Ton : professionnel, direct, sans jargon inutile. Émotions visées : contrôle, confiance, clarté.

## Anti-references

- Sites « IA génériques » (violet, gros gradients, cartes partout, glow).
- Outils RH opaques qui uploadent le CV sans explication.
- Paywalls agressifs avant le premier résultat.

## Design Principles

1. **Marque d’abord** — Test Mon CV géant sur hero sombre dès le premier viewport.
2. **Une idée par section** — hero = marque + promesse ; outil = upload ; pas de clutter.
3. **Preuve par le score** — jauge + catégories, pas d’abstraction décorative.
4. **Confidentialité visible** — rappel « analyse locale » près de l’upload et dans le footer.
5. **Normes FR / UE** — CMP Consent Mode v2, pages LCEN/RGPD/cookies/a11y, PWA.
6. **Identité visuelle Test2** — forêt / papier crème / or, Quattrocento + Josefin Sans, FR/EN i18n (pas de /en routes), footer discret « Édité par Crevia ».

## Diagnostic ATS — Précision

Le moteur d'analyse (`analyzer.js`) évalue 4 axes à 25 pts (lisibilité, structure, contenu, mots-clés). Critères de passage renforcés :

- **Passes gate** : score ≥ 72, lisibilité ≥ 15, pas de colonnes/tableaux, nom complet, email, téléphone, rôle complet, métriques, verbes d'action, sections éducation + compétences.
- **Détection téléphone** : FR (`06 XX`…), international (`+44`…), US `(555) 123-4567`.
- **Mots-clés** : cap sans offre à 12/25 ; ~60 keywords techniques hard ; blocklist soft skills.
- **Verbes d'action** : ~75 FR/EN ; pénalité renforcée si ≥ 4 formulations faibles.
- **Métriques** : exclusion faux positifs (durées, numéros de page, petites équipes ≤ 5).
- **Sections supplémentaires** : certifications, projets, publications, bénévolat, références.
- **Checks ATS** : dates overlapping, chronologie inversée, ordre sections (expérience avant formation si ≥ 3 rôles).
- **Orthographe/grammaire** : ~45 typos + ~23 règles grammaticales FR/EN.
- **Tests de régression** : score goodCv pinné, CV anglais, anti-gaming, dates overlapping, phone international.

## Accessibility & Inclusion

Panneau d’accessibilité (contraste, taille de texte, soulignement, espacement, réduction de mouvement). Cibles : WCAG 2.2 AA / RGAA 4.1 / EAA. Skip link, focus visible, dialogues clavier.

## Quality & Security bar (Impeccable + Test/Test2)

Ce dépôt embarque les **mêmes skills Impeccable** que Test2 (`.cursor/skills/impeccable`, hooks Cursor + GitHub) et les exigences qualité/sécurité suivantes :

- Design detector hook sur edits UI (HTML/CSS/JS)
- Audit technique : a11y, perf, responsive, anti-patterns (`/impeccable audit`)
- Harden : erreurs, empty states, offline PWA (`/impeccable harden`)
- Sécurité : Consent Mode deny-by-default, pas d’upload CV, `security.txt`, headers recommandés, anti-copie soft (`js/protect.js`) désactivé en mode a11y
- Checklist PR + script `npm run audit:static`
