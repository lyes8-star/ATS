/**
 * Client Mode Pro — appelle le Worker CF (analyse LLM, ESCO, PDF patch).
 * Activé uniquement après consentement explicite.
 */

const STORAGE_KEY = "ats_pro_consent_v1";

export function hasProConsent() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setProConsent(ok) {
  try {
    if (ok) localStorage.setItem(STORAGE_KEY, "1");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  document.dispatchEvent(new CustomEvent("ats:pro-consent", { detail: { enabled: !!ok } }));
}

export function getProApiBase() {
  const site = window.ATS_SITE || {};
  return String(site.proApiBase || window.ATS_PRO_API || "")
    .trim()
    .replace(/\/$/, "");
}

export function isProFeatureEnabled() {
  const site = window.ATS_SITE || {};
  return Boolean(site.proEnabled || getProApiBase());
}

export function isProConfigured() {
  return Boolean(getProApiBase());
}

/**
 * @param {string} path
 * @param {object} body
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function proFetch(path, body, opts = {}) {
  const base = getProApiBase();
  if (!base) throw new Error("Mode Pro non configuré (proApiBase manquant).");
  if (!hasProConsent()) throw new Error("Consentement Mode Pro requis.");

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Mode Pro ${res.status}: ${errText.slice(0, 200) || res.statusText}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/pdf")) {
    return { blob: await res.blob(), contentType: ct };
  }
  return res.json();
}

/**
 * Enrichissement LLM → annotations atelier.
 * @param {{ text: string, jobDescription?: string, lang?: string }} payload
 */
export async function proAnalyze(payload) {
  return proFetch("/pro/analyze", {
    text: payload.text,
    jobDescription: payload.jobDescription || "",
    lang: payload.lang || "fr",
  });
}

/**
 * Overlap ESCO/ROME live CV ↔ JD.
 */
export async function proSkills(payload) {
  return proFetch("/pro/skills", {
    text: payload.text,
    jobDescription: payload.jobDescription || "",
    lang: payload.lang || "fr",
  });
}

/**
 * Patch / reflow PDF — body avec pdfBase64 + patches.
 * @returns {Promise<Blob>}
 */
export async function proPdfPatch(payload) {
  const base = getProApiBase();
  if (!base) throw new Error("Mode Pro non configuré.");
  if (!hasProConsent()) throw new Error("Consentement Mode Pro requis.");

  const res = await fetch(`${base}/pro/pdf-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/pdf, application/json" },
    body: JSON.stringify({
      pdfBase64: payload.pdfBase64,
      patches: payload.patches || [],
      optimizedText: payload.optimizedText || "",
      lang: payload.lang || "fr",
      fileName: payload.fileName || "cv.pdf",
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`PDF Pro ${res.status}: ${errText.slice(0, 200)}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    if (data.pdfBase64) {
      const bin = Uint8Array.from(atob(data.pdfBase64), (c) => c.charCodeAt(0));
      return new Blob([bin], { type: "application/pdf" });
    }
    throw new Error(data.error || "Réponse PDF invalide");
  }
  return res.blob();
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
