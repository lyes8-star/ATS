---
name: Test Mon CV
description: Atelier de contrôle CV pour logiciels de recrutement — analyse locale, score /100
colors:
  primary: "#2c4a3e"
  primary-dark: "#1e3329"
  accent: "#c4a35a"
  accent-bright: "#d4b86a"
  accent-soft: "rgba(196, 163, 90, 0.14)"
  bg: "#faf8f5"
  bg-2: "#f3efe8"
  border: "rgba(44, 74, 62, 0.12)"
  text: "#2c4a3e"
  text-muted: "#5c6b64"
  white: "#ffffff"
  success: "#1b7a4a"
  warning: "#d97706"
  danger: "#b42318"
typography:
  display:
    fontFamily: "Quattrocento, Georgia, serif"
    fontSize: "clamp(2.8rem, 8vw, 5rem)"
    fontWeight: 700
    lineHeight: 1.05
  heading:
    fontFamily: "Quattrocento, Georgia, serif"
    fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Josefin Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.12em"
  readable-a11y:
    fontFamily: "Verdana, Geneva, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
rounded:
  sm: "8px"
  md: "10px"
  lg: "16px"
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
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.md}"
    padding: "0.85rem 1.75rem"
  button-ghost:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary-dark}"
    rounded: "{rounded.md}"
    padding: "0.85rem 1.75rem"
  fab-chat:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary-dark}"
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

Langage visuel aligné sur le craft **Test2** (Procept) : forêt `#2c4a3e` / `#1e3329`, papier crème `#faf8f5`, **or `#c4a35a`**, Quattrocento (display) + Josefin Sans (UI), header glass + gold hairline, ombres douces, CTAs radius ~10px uppercase.

## Principes

- Marque **Test Mon CV** hero-level (H1 Quattrocento sur plan forêt)
- Premier viewport = marque + 1 lead + CTAs ; upload en section `#outil`
- Boutons or (texte forêt) avec hover lift ; focus ring or
- Analyse locale mise en avant sans claim marketing inventé
