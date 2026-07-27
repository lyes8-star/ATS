---
name: Test Mon CV
description: Vérificateur de compatibilité ATS pour CV — analyse locale, score /100
colors:
  primary: "#2c2a28"
  primary-dark: "#1a1918"
  accent: "#d4a853"
  accent-terra: "#c45c26"
  bg: "#faf6f0"
  bg-2: "#f5f0e8"
  border: "#ede0cf"
  text: "#2c2a28"
  text-muted: "#78716c"
  white: "#ffffff"
  success: "#15803d"
  warning: "#d97706"
  danger: "#991b1b"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.15
  heading:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.06em"
  readable-a11y:
    fontFamily: "Verdana, Geneva, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.65rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
  section: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-terra}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1.5rem"
  button-ghost:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.accent}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 1rem"
  fab-chat:
    backgroundColor: "#16a34a"
    textColor: "{colors.white}"
    size: "52px"
    rounded: "{rounded.pill}"
  fab-a11y:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    size: "52px"
    rounded: "{rounded.pill}"
---

# DESIGN.md

## Overview

Test Mon CV is a brand-first marketing + tool surface for a free ATS CV checker. Visual system: charcoal + gold + terracotta accents on a warm paper background (product heritage from the reference verifier UX), Space Grotesk for display, IBM Plex Sans for UI. One composition on first viewport: brand, headline, short support, upload CTA.

## Colors

- **Charcoal** `#2c2a28` — brand / nav / primary surfaces
- **Gold** `#d4a853` — brand accent
- **Terra** `#c45c26` — primary CTA
- **Warm bg** `#faf6f0` / `#f5f0e8` — intentional paper ground (documented heritage; not generic SaaS cream-by-default)
- Semantic greens / ambers / reds for score states only

## Typography

- Display / headings: Space Grotesk
- Body / UI: IBM Plex Sans
- A11y readable mode: Verdana fallback via `.a11y-readable`

## Layout

- Max content ~56–64rem
- Hero centered upload dropzone
- Results: score gauge → pass banner → diagnostic → category grid
- Floating FABs: a11y (above) + chat (bottom-right); cookie banner bottom

## Motion

- Gauge stroke animation, dropzone hover, panel open/close
- Always respect `prefers-reduced-motion` / `.a11y-motion`

## Accessibility

Skip link, focus-visible, ARIA on dialogs/CMP/chat, touch targets ≥44px on FABs, contrast targets WCAG AA.

## Quality gate

Impeccable detector hooks apply to HTML/CSS/JS edits. Prefer tokens from this file over one-off hex in new components.
