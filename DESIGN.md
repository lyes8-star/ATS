---
name: Test Mon CV
description: Atelier de contrôle CV pour logiciels de recrutement — analyse locale, score /100
colors:
  primary: "#0e1218"
  primary-dark: "#07090c"
  accent: "#ff5a1f"
  accent-bright: "#7dd3fc"
  accent-soft: "rgba(255, 90, 31, 0.12)"
  bg: "#f2f4f7"
  bg-2: "#e8ebf0"
  border: "rgba(14, 18, 24, 0.1)"
  text: "#0e1218"
  text-muted: "#4a5563"
  white: "#ffffff"
  success: "#1b7a4a"
  warning: "#d97706"
  danger: "#b42318"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(3.2rem, 14vw, 7rem)"
    fontWeight: 700
    lineHeight: 0.9
  heading:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.04em"
  readable-a11y:
    fontFamily: "Verdana, Geneva, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "6px"
  md: "0.85rem"
  lg: "999px"
spacing:
  xs: "0.35rem"
  sm: "0.65rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
  section: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "0.8rem 1.45rem"
  button-ghost:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    rounded: "{rounded.lg}"
    padding: "0.8rem 1.45rem"
  fab-chat:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    size: "52px"
    rounded: "{rounded.md}"
  fab-a11y:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    size: "52px"
    rounded: "{rounded.md}"
---

# DESIGN.md — Test Mon CV

## Direction

Langage visuel aligné sur le repo **Test** (Crevia) : encre `#0e1218`, papier froid `#f2f4f7`, **signal orange `#ff5a1f`**, **beam cyan `#7dd3fc`**, Space Grotesk + IBM Plex Sans, grain léger, CTAs pill.

## Principes

- Marque **Test Mon CV** hero-level (H1 géant sur plan sombre)
- Premier viewport = marque + 1 lead + CTAs ; upload en section `#outil`
- Boutons pill signal avec glow ; focus ring beam
- Analyse locale mise en avant sans claim marketing inventé
