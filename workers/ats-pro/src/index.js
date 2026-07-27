/**
 * Cloudflare Worker — Mode Pro ATS Check
 *
 * Secrets (wrangler secret put):
 *   OPENAI_API_KEY or ANTHROPIC_API_KEY
 *   PRO_CORS_ORIGIN (optional, default *)
 *
 * Routes:
 *   POST /pro/analyze  — LLM → annotations JSON
 *   POST /pro/skills   — ESCO search + overlap
 *   POST /pro/pdf-patch — reflow PDF (pdf-lib) from optimized text
 *   GET  /health
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MAX_TEXT = 80_000;
const MAX_PDF_B64 = 12_000_000;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "ats-pro" }, cors);
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, cors, 405);
    }

    try {
      if (url.pathname === "/pro/analyze") {
        return json(await handleAnalyze(await request.json(), env), cors);
      }
      if (url.pathname === "/pro/skills") {
        return json(await handleSkills(await request.json(), env), cors);
      }
      if (url.pathname === "/pro/pdf-patch") {
        const body = await request.json();
        const result = await handlePdfPatch(body, env);
        if (result instanceof Response) {
          for (const [k, v] of Object.entries(cors)) result.headers.set(k, v);
          return result;
        }
        return json(result, cors);
      }
      return json({ error: "Not found" }, cors, 404);
    } catch (err) {
      console.error(err);
      return json({ error: String(err.message || err) }, cors, 500);
    }
  },
};

function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "*";
  const allow = env.PRO_CORS_ORIGIN || "*";
  const ok = allow === "*" || allow.split(",").map((s) => s.trim()).includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (allow === "*" ? "*" : origin) : allow.split(",")[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, cors, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function clampText(t) {
  return String(t || "").slice(0, MAX_TEXT);
}

async function handleAnalyze(body, env) {
  const text = clampText(body.text);
  const jd = clampText(body.jobDescription || "");
  const lang = body.lang === "en" ? "en" : "fr";
  if (text.length < 40) throw new Error("Texte CV trop court");

  const annotations = await llmAnnotations(text, jd, lang, env);
  return {
    annotations,
    source: "llm",
    retainedSeconds: 0,
  };
}

async function llmAnnotations(text, jd, lang, env) {
  const system =
    lang === "en"
      ? `You improve CVs for ATS. Return ONLY JSON: {"annotations":[{"kind":"typo"|"passive_verb"|"missing_metric"|"keyword","applyMode":"replace"|"insert_after","quote":"exact substring from CV","suggestion":"replacement or insert","title":"short","detail":"one sentence"}]}. Max 12 annotations. quote MUST appear verbatim in the CV for replace.`
      : `Tu améliores des CV pour les ATS. Réponds UNIQUEMENT en JSON: {"annotations":[{"kind":"typo"|"passive_verb"|"missing_metric"|"keyword","applyMode":"replace"|"insert_after","quote":"sous-chaîne exacte du CV","suggestion":"remplacement ou insertion","title":"court","detail":"une phrase"}]}. Max 12 annotations. quote DOIT exister tel quel dans le CV pour replace.`;

  const user = `CV:\n${text.slice(0, 12000)}\n\n${jd ? `OFFRE:\n${jd.slice(0, 4000)}` : "Pas d'offre."}`;

  if (env.OPENAI_API_KEY) {
    const raw = await callOpenAI(env.OPENAI_API_KEY, system, user);
    return validateAnnotations(raw, text);
  }
  if (env.ANTHROPIC_API_KEY) {
    const raw = await callAnthropic(env.ANTHROPIC_API_KEY, system, user);
    return validateAnnotations(raw, text);
  }
  // Offline stub when no keys — heuristic suggestions
  return heuristicAnnotations(text, lang);
}

function validateAnnotations(raw, text) {
  let data = raw;
  if (typeof raw === "string") {
    const m = raw.match(/\{[\s\S]*\}/);
    data = m ? JSON.parse(m[0]) : { annotations: [] };
  }
  const list = Array.isArray(data?.annotations) ? data.annotations : [];
  const out = [];
  let i = 0;
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const applyMode = a.applyMode === "insert_after" || a.applyMode === "insert_header" ? a.applyMode : "replace";
    const quote = String(a.quote || "").slice(0, 400);
    const suggestion = String(a.suggestion || "").slice(0, 800);
    if (applyMode === "replace") {
      if (!quote || !text.includes(quote)) continue;
      const start = text.indexOf(quote);
      out.push({
        id: `pro-${++i}`,
        kind: String(a.kind || "keyword"),
        applyMode,
        quote,
        suggestion,
        title: String(a.title || "Suggestion Pro").slice(0, 120),
        detail: String(a.detail || "").slice(0, 400),
        textStart: start,
        textEnd: start + quote.length,
        status: "pending",
        source: "pro-llm",
      });
    } else if (suggestion) {
      out.push({
        id: `pro-${++i}`,
        kind: String(a.kind || "keyword"),
        applyMode,
        quote: quote || "(fin du document)",
        suggestion,
        title: String(a.title || "Suggestion Pro").slice(0, 120),
        detail: String(a.detail || "").slice(0, 400),
        textStart: text.length,
        textEnd: text.length,
        status: "pending",
        source: "pro-llm",
      });
    }
    if (out.length >= 12) break;
  }
  return out;
}

function heuristicAnnotations(text, lang) {
  const out = [];
  const passive = text.match(/\bresponsable de\b/i);
  if (passive) {
    const quote = passive[0];
    const start = text.toLowerCase().indexOf(quote.toLowerCase());
    out.push({
      id: "pro-1",
      kind: "passive_verb",
      applyMode: "replace",
      quote: text.slice(start, start + quote.length),
      suggestion: lang === "en" ? "Led" : "Piloté",
      title: lang === "en" ? "Stronger verb" : "Verbe plus fort",
      detail: "",
      textStart: start,
      textEnd: start + quote.length,
      status: "pending",
      source: "pro-heuristic",
    });
  }
  return out;
}

async function callOpenAI(key, system, user) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "{}";
}

async function callAnthropic(key, system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data.content?.map((c) => c.text).join("") || "{}";
}

async function handleSkills(body, env) {
  const text = clampText(body.text).toLowerCase();
  const jd = clampText(body.jobDescription || "").toLowerCase();
  if (!jd || jd.length < 20) {
    return { overlap: [], score: null, jdTerms: [], source: "none" };
  }

  let terms = [];
  try {
    terms = await fetchEscoTerms(jd, env);
  } catch (e) {
    console.warn("ESCO fail", e);
  }
  if (!terms.length) {
    terms = extractKeywordCandidates(jd);
  }

  const overlap = terms.filter((t) => text.includes(t.toLowerCase()));
  const score = terms.length ? Math.round((overlap.length / terms.length) * 100) : 0;
  return {
    overlap,
    score,
    jdTerms: terms.slice(0, 40),
    source: terms.length ? "esco+local" : "local",
    retainedSeconds: 0,
  };
}

async function fetchEscoTerms(jd, env) {
  const seeds = extractKeywordCandidates(jd).slice(0, 8);
  const found = new Set();
  for (const seed of seeds) {
    const q = encodeURIComponent(seed);
    const url = `https://ec.europa.eu/esco/api/search?text=${q}&type=skill&language=fr&limit=5`;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cf: env.ESCO_CACHE_TTL ? { cacheTtl: Number(env.ESCO_CACHE_TTL) } : undefined,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data._embedded?.results || data.results || [];
      for (const r of results) {
        const label = r.title || r.preferredLabel?.fr || r.preferredLabel?.en || r.label;
        if (label && String(label).length > 2 && String(label).length < 48) {
          found.add(String(label).toLowerCase());
        }
      }
    } catch {
      /* continue */
    }
    if (found.size >= 30) break;
  }
  return [...found];
}

function extractKeywordCandidates(text) {
  const stop = new Set(
    "les des une pour avec dans sur aux par plus être avoir votre nous vous cette ces sont dans and the for with your you".split(
      " "
    )
  );
  const words = (text.match(/[a-zà-üA-ZÀ-Ü][a-zà-üA-ZÀ-Ü\-+/]{3,}/g) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !stop.has(w));
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 25);
}

async function handlePdfPatch(body, env) {
  const b64 = String(body.pdfBase64 || "");
  if (b64.length > MAX_PDF_B64) throw new Error("PDF trop volumineux");
  const optimizedText = clampText(body.optimizedText || "");
  const lang = body.lang === "en" ? "en" : "fr";

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 40;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - margin;
    const maxWidth = pageWidth - margin * 2;
    const lines = buildPdfLines(optimizedText, lang);

    const draw = (text, size, bold = false) => {
      const f = bold ? fontBold : font;
      const wrapped = wrapText(text, f, size, maxWidth);
      for (const line of wrapped) {
        if (y < margin + size) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = pageHeight - margin;
        }
        page.drawText(line, {
          x: margin,
          y: y - size,
          size,
          font: f,
          color: rgb(0.11, 0.1, 0.09),
        });
        y -= size * 1.35;
      }
    };

    for (const block of lines) {
      if (block.type === "h1") {
        draw(block.text, 16, true);
        y -= 4;
      } else if (block.type === "h2") {
        y -= 6;
        draw(block.text.toUpperCase(), 10, true);
        y -= 2;
      } else if (block.type === "bullet") {
        draw(`• ${block.text}`, 9, false);
      } else {
        draw(block.text, 9, false);
      }
    }

    const bytes = await pdfDoc.save();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sanitizeName(body.fileName || "cv")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Fallback: return base64 JSON if pdf-lib not bundled
    console.warn("pdf-lib reflow failed", err);
    return {
      error: "pdf_reflow_unavailable",
      message: String(err.message || err),
      hint: "Bundle pdf-lib in the Worker or use client HTML print.",
    };
  }
}

function sanitizeName(n) {
  return String(n || "cv")
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 80);
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function buildPdfLines(text, lang) {
  const blocks = [];
  const lines = String(text || "").split(/\n/);
  let first = true;
  const headerRe =
    /^(exp[ée]rience|formation|comp[ée]tences?|langues?|profil|skills|education|languages)/i;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (first) {
      blocks.push({ type: "h1", text: line });
      first = false;
      continue;
    }
    if (headerRe.test(line) && line.length < 48) {
      blocks.push({ type: "h2", text: line });
      continue;
    }
    if (/^[-•*]/.test(line)) {
      blocks.push({ type: "bullet", text: line.replace(/^[-•*]\s*/, "") });
      continue;
    }
    blocks.push({ type: "p", text: line });
  }
  if (!blocks.length) {
    blocks.push({
      type: "p",
      text: lang === "en" ? "Empty CV" : "CV vide",
    });
  }
  return blocks;
}
