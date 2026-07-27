/**
 * Extraction texte + géométrie (PDF) / HTML (DOCX)
 * 100 % client — le fichier ne quitte pas le navigateur.
 */

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} NormRect
 * @typedef {{
 *   str: string,
 *   page: number,
 *   rect: NormRect,
 *   textStart: number,
 *   textEnd: number
 * }} TextItem
 * @typedef {{
 *   page: number,
 *   width: number,
 *   height: number,
 *   items: TextItem[]
 * }} PageGeo
 * @typedef {{
 *   text: string,
 *   pages: number|null,
 *   format: 'pdf'|'docx'|'txt',
 *   pdfDoc: any|null,
 *   pagesGeo: PageGeo[],
 *   html: string|null,
 *   approximate: boolean,
 *   tableCount?: number,
 *   originalBuffer?: ArrayBuffer|null
 * }} ExtractResult
 */

function ensurePdfjs() {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("Bibliothèque PDF non chargée.");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";
  return pdfjs;
}

/**
 * Convertit un item pdf.js en rectangle normalisé 0–1 (origine haut-gauche).
 * @param {any} item
 * @param {number} pageWidth
 * @param {number} pageHeight
 * @returns {NormRect|null}
 */
export function itemToNormRect(item, pageWidth, pageHeight) {
  if (!item?.transform || !pageWidth || !pageHeight) return null;
  const [a, b, , , e, f] = item.transform;
  const fontHeight = Math.hypot(b, a) || Math.abs(a) || 10;
  const width = item.width != null ? item.width : (item.str?.length || 1) * fontHeight * 0.5;
  const height = fontHeight * 1.15;
  // PDF user space: origin bottom-left; y grows up
  const x = e / pageWidth;
  const yTop = (pageHeight - f - height) / pageHeight;
  const w = width / pageWidth;
  const h = height / pageHeight;
  return {
    x: clamp01(x),
    y: clamp01(yTop),
    w: Math.max(0.002, Math.min(1 - clamp01(x), w)),
    h: Math.max(0.004, Math.min(1 - clamp01(yTop), h)),
  };
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/**
 * @param {File} file
 * @returns {Promise<ExtractResult>}
 */
export async function extractFromPdf(file) {
  const pdfjs = ensurePdfjs();
  // Copy bytes before pdf.js (worker may detach/transfer the ArrayBuffer)
  const ab = await file.arrayBuffer();
  const originalBuffer = ab.slice(0);
  const data = new Uint8Array(ab);
  const doc = await pdfjs.getDocument({ data }).promise;
  const pagesGeo = [];
  let text = "";
  let cursor = 0;
  let itemCount = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];

    for (const it of content.items) {
      if (!it.str) continue;
      const rect = itemToNormRect(it, viewport.width, viewport.height);
      const str = it.str;
      const textStart = cursor;
      const textEnd = cursor + str.length;
      items.push({
        str,
        page: i,
        rect: rect || { x: 0, y: 0, w: 0, h: 0 },
        textStart,
        textEnd,
      });
      text += str;
      cursor = textEnd;
      // espace entre items (approx pdf.js)
      if (!/\s$/.test(str)) {
        text += " ";
        cursor += 1;
      }
      itemCount += 1;
    }
    text += "\n";
    cursor += 1;
    pagesGeo.push({
      page: i,
      width: viewport.width,
      height: viewport.height,
      items,
    });
  }

  const approximate = itemCount < 8 || text.replace(/\s/g, "").length < 40;

  return {
    text,
    pages: doc.numPages,
    format: "pdf",
    pdfDoc: doc,
    pagesGeo,
    html: null,
    approximate,
    tableCount: 0,
    originalBuffer,
  };
}

/**
 * @param {File} file
 * @returns {Promise<ExtractResult>}
 */
/**
 * Compte les tableaux Word (`w:tbl`) via PizZip si dispo, sinon approx HTML Mammoth.
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} html
 */
function countDocxTables(arrayBuffer, html) {
  try {
    const PizZip = window.PizZip || window.JSZip;
    if (PizZip) {
      const zip = new PizZip(arrayBuffer);
      const docXml = zip.file("word/document.xml")?.asText?.() || "";
      const n = (docXml.match(/<w:tbl[\s>]/g) || []).length;
      if (n >= 0) return n;
    }
  } catch {
    /* fall through */
  }
  return (html.match(/<table[\s>]/gi) || []).length;
}

export async function extractFromDocx(file) {
  if (!window.mammoth) throw new Error("Bibliothèque DOCX non chargée.");
  const arrayBuffer = await file.arrayBuffer();
  const [raw, htmlResult] = await Promise.all([
    window.mammoth.extractRawText({ arrayBuffer }),
    window.mammoth.convertToHtml({ arrayBuffer }),
  ]);
  const text = raw.value || "";
  const html = htmlResult.value || "<p></p>";
  const tableCount = countDocxTables(arrayBuffer, html);
  return {
    text,
    pages: null,
    format: "docx",
    pdfDoc: null,
    pagesGeo: [],
    html,
    approximate: true,
    tableCount,
    originalBuffer: arrayBuffer,
  };
}

/**
 * @param {File} file
 * @returns {Promise<ExtractResult>}
 */
export async function extractFromTxt(file) {
  const text = await file.text();
  const html = `<pre class="cv-txt">${escapeHtml(text)}</pre>`;
  return {
    text,
    pages: null,
    format: "txt",
    pdfDoc: null,
    pagesGeo: [],
    html,
    approximate: true,
    tableCount: 0,
    originalBuffer: null,
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {File} file
 * @returns {Promise<ExtractResult>}
 */
export async function extractDocument(file) {
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractFromPdf(file);
  }
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractFromDocx(file);
  }
  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return extractFromTxt(file);
  }
  throw new Error("Format non supporté. Utilisez un PDF ou un DOCX.");
}

/**
 * Cherche les rectangles PDF correspondant à un extrait de texte.
 * @param {PageGeo[]} pagesGeo
 * @param {number} textStart
 * @param {number} textEnd
 * @returns {{ page: number, rects: NormRect[] }}
 */
export function rectsForRange(pagesGeo, textStart, textEnd) {
  const rectsByPage = new Map();
  for (const page of pagesGeo || []) {
    for (const item of page.items) {
      if (item.textEnd <= textStart || item.textStart >= textEnd) continue;
      if (!item.rect || (item.rect.w === 0 && item.rect.h === 0)) continue;
      if (!rectsByPage.has(item.page)) rectsByPage.set(item.page, []);
      rectsByPage.get(item.page).push(item.rect);
    }
  }
  if (rectsByPage.size === 0) {
    return { page: 1, rects: [] };
  }
  // page avec le plus de hits
  let bestPage = 1;
  let bestRects = [];
  for (const [page, rects] of rectsByPage) {
    if (rects.length > bestRects.length) {
      bestPage = page;
      bestRects = rects;
    }
  }
  return { page: bestPage, rects: mergeCloseRects(bestRects) };
}

/**
 * Fusionne des rects proches sur la même ligne.
 * @param {NormRect[]} rects
 */
function mergeCloseRects(rects) {
  if (!rects.length) return [];
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    const sameLine = Math.abs(r.y - cur.y) < cur.h * 0.6;
    const near = r.x <= cur.x + cur.w + 0.02;
    if (sameLine && near) {
      const x2 = Math.max(cur.x + cur.w, r.x + r.w);
      const y2 = Math.max(cur.y + cur.h, r.y + r.h);
      cur = {
        x: Math.min(cur.x, r.x),
        y: Math.min(cur.y, r.y),
        w: x2 - Math.min(cur.x, r.x),
        h: y2 - Math.min(cur.y, r.y),
      };
    } else {
      out.push(cur);
      cur = { ...r };
    }
  }
  out.push(cur);
  return out.slice(0, 8);
}

/**
 * Fallback : bandeau haut page 1 (insertion coordonnées / section).
 * @returns {NormRect[]}
 */
export function headerBannerRects() {
  return [{ x: 0.05, y: 0.02, w: 0.9, h: 0.06 }];
}

/**
 * Fallback : ancre bas de dernière page.
 * @returns {NormRect[]}
 */
export function footerAnchorRects() {
  return [{ x: 0.05, y: 0.9, w: 0.9, h: 0.06 }];
}
