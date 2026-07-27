# ATS Check

Analyseur de compatibilité ATS pour CV (PDF / DOCX).

## Lancer

Ouvrir `index.html` via un serveur local (les modules ES et PDF.js nécessitent HTTP) :

```bash
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080/

## Fonctionnalités

- Upload PDF ou DOCX (analyse 100 % dans le navigateur)
- Score /100 sur 4 axes : Lisibilité ATS, Structure, Qualité, Mots-clés
- Diagnostic (gaps, métriques, profil académique…)
- Détection de fautes d'orthographe courantes (FR/EN)
- Page de résultats inspirée d'un vérificateur ATS professionnel

## Tests

```bash
node js/test-analyzer.mjs
```
