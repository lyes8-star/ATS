---
name: cv-layout
description: >-
  Rules for ATS Clean CV export: one-page single-column layout, structured
  parse→HTML/DOCX mapping, no tool branding. Use when editing export-cv.js,
  export-reconstruct.js, or CV download/print output.
---

# CV Layout (ATS Clean)

## Goal

Exported CVs must look like a professional one-page resume — not a text dump.

## Hard rules

1. **One page A4** — tight margins (~12–14 mm), body ~9.5–10.5 pt, compact section gaps.
2. **One column** — linear reading order for humans and ATS.
3. **Structure from parse** — use `parseCv` / `buildCvModel` (name, title, contact, roles with bullets, education, skills). Never dump raw optimized text as one wall.
4. **Hierarchy** — display name (serif), job headline, contact line, uppercase section headings with hairline, role title+dates, bullets.
5. **Skills** — compact ` · `-separated line (max ~18), not a paragraph wall.
6. **No branding** — never include “Généré par”, product name, score, or tool attribution in the downloaded/printed document. Print button is `no-print` only.
7. **Compression** — if too long: keep 3–4 recent roles fuller; older roles ≤1 bullet; education ≤3 lines.
8. **No cards / badges / emoji / pill clusters** in the CV document.

## File map

| File | Role |
|------|------|
| `js/export-cv.js` | `buildCvModel`, `buildCleanHtml`, downloads |
| `js/export-reconstruct.js` | DOCX reconstruct + `downloadLayoutFaithful` |
| `js/export-docx.js` | DOCX in-place (preserve original styles) |
| `js/parse-cv.js` | Structured parse input |

## Checklist (before shipping export changes)

- [ ] Sample CV opens as clear sections (not one paragraph)
- [ ] Name is visually primary; contact on one line
- [ ] Experience shows title — company and dates
- [ ] Bullets are `<li>` / Word bullets
- [ ] HTML source has **no** “Généré”, “ATS Check”, or score footer
- [ ] Print CSS hides UI chrome
- [ ] `npm run audit` passes

## Inspiration (open algorithms, not copies)

Open-Resume / JSON Resume: items → lines → sections → themed render. Reimplement locally; do not vendor their UI.
