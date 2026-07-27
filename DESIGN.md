---
name: Test Mon CV
description: Atelier de contrôle CV pour logiciels de recrutement — analyse locale, score /100
colors:
  primary: "#12161c"
  primary-dark: "#0a0c10"
  accent: "#0f766e"
  accent-bright: "#14b8a6"
  accent-soft: "#d9f0ed"
  bg: "#f3f5f7"
  bg-2: "#e8ecef"
  border: "#d5dbe3"
  text: "#12161c"
  text-muted: "#64748b"
  white: "#ffffff"
  success: "#15803d"
  warning: "#d97706"
  danger: "#991b1b"
typography:
  display:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 800
    lineHeight: 1.15
  heading:
    fontFamily: "Syne, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 2.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
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
  md: "8px"
  lg: "12px"
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
    rounded: "{rounded.md}"
    padding: "0.75rem 1.5rem"
  button-ghost:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
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

Encre ardoise, papier froid, accent teal. Atelier de contrôle de document — pas un template « vérificateur ATS » crème/terracotta, pas de shell agence.

## Principes

- Marque **Test Mon CV** hero-level sur la landing
- Une composition au premier viewport (marque, titre, lead, upload)
- CTA rectangulaires teal ; pas de pills décoratives
- Analyse locale mise en avant sans claim marketing inventé
