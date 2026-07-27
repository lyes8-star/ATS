# Test Mon CV — Mode Pro / Extrait Worker

Cloudflare Worker for optional **Mode Pro** (LLM, ESCO, PDF) and **Enrichissement Extrait** (LanguageTool, Nominatim, photo classify).

## Setup

```bash
cd workers/ats-pro
npm install
npx wrangler secret put OPENAI_API_KEY   # or ANTHROPIC_API_KEY
# optional:
npx wrangler secret put LANGUAGETOOL_API_KEY
npx wrangler secret put PRO_CORS_ORIGIN   # e.g. https://www.testmoncv.fr
npx wrangler deploy
```

Set the public Worker URL in site config:

```json
"proApiBase": "https://ats-pro.<account>.workers.dev"
```

in [`data/site.json`](../../data/site.json).

## Privacy

- No durable CV storage; request body processed in memory.
- Client must send consent (`ats_enrich_consent_v1` and/or `ats_pro_consent_v1`) before calling.
- Logs must not include CV body or images.
- CORS: set `PRO_CORS_ORIGIN` to `https://www.testmoncv.fr` in production.

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | — | `{ ok }` |
| POST | `/pro/analyze` | `{ text, jobDescription?, lang? }` | `{ annotations[] }` |
| POST | `/pro/skills` | `{ text, jobDescription, lang? }` | `{ overlap, score, jdTerms }` |
| POST | `/pro/pdf-patch` | `{ pdfBase64?, optimizedText, lang?, fileName? }` | `application/pdf` |
| POST | `/pro/grammar` | `{ text, lang? }` | `{ issues[] }` |
| POST | `/pro/geocode` | `{ address?, location? }` | `{ ok, normalized, confidence, lat, lon }` |
| POST | `/pro/photo-classify` | `{ imageBase64, mime? }` | `{ kind, confidence }` |
