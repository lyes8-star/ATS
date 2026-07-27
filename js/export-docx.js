/**
 * Édition DOCX in-place (PizZip) — préserve styles, colonnes, tableaux, polices.
 * Fallback : régénération via export-reconstruct si un remplacement échoue.
 */

function ensurePizZip() {
  const PizZip = window.PizZip || window.JSZip;
  if (!PizZip) throw new Error("PizZip non chargé.");
  return PizZip;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Fusionne les w:t d'un même paragraphe pour faciliter les remplacements.
 * @param {string} xml
 */
export function mergeAdjacentWt(xml) {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    const texts = [];
    const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let m;
    while ((m = re.exec(para)) !== null) {
      texts.push(decodeXml(m[1]));
    }
    if (texts.length <= 1) return para;
    const merged = escapeXml(texts.join(""));
    let first = true;
    return para.replace(/<w:t\b[^>]*>[\s\S]*?<\/w:t>/g, () => {
      if (first) {
        first = false;
        return `<w:t xml:space="preserve">${merged}</w:t>`;
      }
      return `<w:t xml:space="preserve"></w:t>`;
    });
  });
}

/**
 * Remplace le premier match de `from` dans le contenu des w:t (texte décodé).
 * @param {string} xml
 * @param {string} from
 * @param {string} to
 * @returns {{ xml: string, ok: boolean }}
 */
export function replaceInDocumentXml(xml, from, to) {
  if (!from) return { xml, ok: false };
  // Build plain text from w:t nodes with offsets into xml
  const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let m;
  const parts = [];
  let plain = "";
  while ((m = re.exec(xml)) !== null) {
    const decoded = decodeXml(m[1]);
    parts.push({
      start: m.index,
      end: m.index + m[0].length,
      innerStart: m.index + m[0].indexOf(m[1]),
      innerEnd: m.index + m[0].indexOf(m[1]) + m[1].length,
      text: decoded,
      rawInner: m[1],
    });
    plain += decoded;
  }
  const idx = plain.indexOf(from);
  if (idx === -1) {
    // soft case-insensitive
    const soft = plain.toLowerCase().indexOf(from.toLowerCase());
    if (soft === -1) return { xml, ok: false };
    return replaceSpan(xml, parts, soft, from.length, to);
  }
  return replaceSpan(xml, parts, idx, from.length, to);
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function replaceSpan(xml, parts, plainStart, len, to) {
  const plainEnd = plainStart + len;
  let cursor = 0;
  /** @type {{ i: number, localStart: number, localEnd: number }[]} */
  const hits = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const next = cursor + p.text.length;
    if (next > plainStart && cursor < plainEnd) {
      hits.push({
        i,
        localStart: Math.max(0, plainStart - cursor),
        localEnd: Math.min(p.text.length, plainEnd - cursor),
      });
    }
    cursor = next;
  }
  if (!hits.length) return { xml, ok: false };

  // Replace across runs: first run gets `to`, others get emptied for the matched span
  let out = xml;
  // Apply from end to start so offsets stay valid
  for (let h = hits.length - 1; h >= 0; h--) {
    const hit = hits[h];
    const p = parts[hit.i];
    const before = p.text.slice(0, hit.localStart);
    const after = p.text.slice(hit.localEnd);
    const newText = h === 0 ? before + to + after : before + after;
    const replacement = escapeXml(newText);
    out = out.slice(0, p.innerStart) + replacement + out.slice(p.innerEnd);
    // Adjust subsequent? we go reverse so earlier parts unchanged — but inner positions
    // of earlier parts (lower i) are before this edit only if they appear earlier in xml.
    // Since we edit from last hit to first and hits are ordered by document order,
    // editing later parts first keeps earlier offsets valid.
  }
  return { xml: out, ok: true };
}

function insertParagraphAfterBodyStart(xml, text) {
  const p = `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const body = xml.indexOf("<w:body");
  if (body === -1) return xml;
  const gt = xml.indexOf(">", body);
  if (gt === -1) return xml;
  return xml.slice(0, gt + 1) + p + xml.slice(gt + 1);
}

function appendParagraphBeforeBodyEnd(xml, text) {
  const p = `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
  const end = xml.lastIndexOf("</w:body>");
  if (end === -1) return xml;
  return xml.slice(0, end) + p + xml.slice(end);
}

/**
 * Applique les annotations acceptées sur un ArrayBuffer DOCX.
 * @param {ArrayBuffer} arrayBuffer
 * @param {object[]} annotations
 * @returns {Promise<{ blob: Blob, failed: object[], usedFallback: boolean }>}
 */
export async function patchDocxInPlace(arrayBuffer, annotations) {
  if (!arrayBuffer || arrayBuffer.detached) {
    throw new Error("ArrayBuffer DOCX détaché ou manquant.");
  }
  const PizZip = ensurePizZip();
  const zip = new PizZip(arrayBuffer);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("DOCX invalide (document.xml manquant).");
  let xml = typeof file.asText === "function" ? file.asText() : await file.async("string");
  xml = mergeAdjacentWt(xml);

  const accepted = (annotations || []).filter((a) => a.status === "accepted");
  const failed = [];

  const replaces = accepted
    .filter((a) => a.applyMode === "replace" && (a.quote || a.suggestion != null))
    .slice()
    .sort((a, b) => (b.quote?.length || 0) - (a.quote?.length || 0));

  for (const ann of replaces) {
    const from = ann.quote || "";
    const to = ann.suggestion ?? "";
    if (!from) {
      failed.push(ann);
      continue;
    }
    const res = replaceInDocumentXml(xml, from, to);
    if (!res.ok) failed.push(ann);
    else xml = res.xml;
  }

  for (const ann of accepted.filter((a) => a.applyMode === "insert_header")) {
    if (ann.suggestion) xml = insertParagraphAfterBodyStart(xml, ann.suggestion);
  }
  for (const ann of accepted.filter((a) => a.applyMode === "insert_after")) {
    if (ann.suggestion) xml = appendParagraphBeforeBodyEnd(xml, ann.suggestion);
  }

  zip.file("word/document.xml", xml);
  const out = zip.generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  return { blob: out, failed, usedFallback: false };
}

/**
 * Télécharge le DOCX patché (in-place). Si échecs → fallback reconstruct.
 * @param {object} session
 * @param {object} [meta]
 */
export async function downloadOptimizedDocx(session, meta = {}) {
  let buffer = session.extracted?.originalBuffer;
  if (!buffer || buffer.detached) {
    buffer = session.originalFile ? await session.originalFile.arrayBuffer() : null;
    if (buffer && session.extracted) {
      session.extracted.originalBuffer = buffer;
    }
  }
  if (!buffer || buffer.detached) {
    throw new Error("Fichier DOCX original indisponible ou buffer détaché.");
  }

  try {
    await ensurePizZipScript();
    const { blob, failed } = await patchDocxInPlace(buffer, session.annotations || []);
    if (failed.length > Math.ceil((session.annotations || []).filter((a) => a.status === "accepted").length / 2)) {
      // Trop d'échecs → fallback
      const { downloadReconstructedDocx } = await import("./export-reconstruct.js");
      await downloadReconstructedDocx(session.optimizedText, session.report?.parsed, {
        ...meta,
        fallbackReason: "inplace-partial-fail",
      });
      return { usedFallback: true, failed };
    }
    triggerDownload(blob, `${baseName(meta.fileName || session.originalFile?.name)}-optimise.docx`);
    return { usedFallback: false, failed };
  } catch (err) {
    console.warn("DOCX in-place failed, fallback reconstruct", err);
    const { downloadReconstructedDocx } = await import("./export-reconstruct.js");
    await downloadReconstructedDocx(session.optimizedText, session.report?.parsed, {
      ...meta,
      fallbackReason: String(err.message || err),
    });
    return { usedFallback: true, failed: [] };
  }
}

function baseName(name) {
  return String(name || "cv").replace(/\.[^.]+$/, "");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let pizzipLoading = null;
export function ensurePizZipScript() {
  if (window.PizZip || window.JSZip) return Promise.resolve();
  if (pizzipLoading) return pizzipLoading;
  pizzipLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pizzip@3.1.7/dist/pizzip.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger PizZip"));
    document.head.appendChild(s);
  });
  return pizzipLoading;
}
