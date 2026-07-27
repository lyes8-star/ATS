# ATS Mode Pro Worker

Cloudflare Worker for optional **Mode Pro** (LLM annotations, ESCO skill overlap, PDF reflow).

## Setup

```bash
cd workers/ats-pro
npm install
npx wrangler secret put OPENAI_API_KEY   # or ANTHROPIC_API_KEY
npx wrangler deploy
```

Set the public Worker URL in site config:

```json
"proApiBase": "https://ats-pro.<account>.workers.dev"
```

in [`data/site.json`](../../data/site.json).

## Privacy

- No durable CV storage; request body processed in memory.
- Client must send `ats_pro_consent_v1` (explicit checkbox) before calling.
- Logs must not include CV body.

## Routes

| Method | Path | Body | Response |
|--------|------|------|----------|
| GET | `/health` | — | `{ ok }` |
| POST | `/pro/analyze` | `{ text, jobDescription?, lang? }` | `{ annotations[] }` |
| POST | `/pro/skills` | `{ text, jobDescription, lang? }` | `{ overlap, score, jdTerms }` |
| POST | `/pro/pdf-patch` | `{ pdfBase64?, optimizedText, lang?, fileName? }` | `application/pdf` |
