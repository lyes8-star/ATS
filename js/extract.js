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
 *   tableHint?: boolean,
 *   headerSparse?: boolean,
 *   readingOrderOk?: boolean,
 *   profilePhotoHint?: boolean,
 *   imageOnlyPages?: number[],
 *   pdfCreator?: string|null,
 *   pdfProducer?: string|null,
 *   originalBuffer?: ArrayBuffer|null,
 *   objectUrl?: string|null
 * }} ExtractResult
 */

/**
 * Clone durable + copie jetable pour pdf.js (transfer/detach).
 * Invariant: `keep` is never passed to getDocument; only `forPdf` may be transferred.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ keep: ArrayBuffer, forPdf: Uint8Array }}
 */
export function cloneBytesForPdf(arrayBuffer) {
  if (!arrayBuffer || arrayBuffer.byteLength == null) {
    throw new Error("ArrayBuffer PDF manquant.");
  }
  if (arrayBuffer.detached) {
    throw new Error("ArrayBuffer PDF déjà détaché — rechargez le fichier.");
  }
  const keep = arrayBuffer.slice(0);
  const forPdf = new Uint8Array(keep.slice(0));
  return { keep, forPdf };
}

/**
 * Révoque l'object URL Blob éventuel d'une extraction PDF.
 * @param {{ objectUrl?: string|null }|null|undefined} extracted
 */
export function revokeExtractObjectUrl(extracted) {
  if (extracted?.objectUrl) {
    try {
      URL.revokeObjectURL(extracted.objectUrl);
    } catch {
      /* ignore */
    }
    extracted.objectUrl = null;
  }
}

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
  // Durable bytes for Mode Pro / re-download — NEVER passed to getDocument
  const source = await file.arrayBuffer();
  const { keep: originalBuffer, forPdf } = cloneBytesForPdf(source);

  let doc = null;
  let objectUrl = null;

  try {
    // Exclusive TypedArray copy — pdf.js 4.x may transfer/detach it
    doc = await pdfjs.getDocument({ data: forPdf }).promise;
  } catch (err) {
    // Fallback without TypedArray transfer: Blob URL
    console.warn("[extract] getDocument(data) failed, retrying via Blob URL", err);
    objectUrl = URL.createObjectURL(new Blob([originalBuffer], { type: "application/pdf" }));
    try {
      doc = await pdfjs.getDocument({
        url: objectUrl,
        disableRange: true,
        disableStream: true,
      }).promise;
    } catch (err2) {
      revokeExtractObjectUrl({ objectUrl });
      objectUrl = null;
      throw err2;
    }
  }

  const pagesGeo = [];
  let text = "";
  let cursor = 0;
  let itemCount = 0;

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    let prev = null;

    for (const it of content.items) {
      if (!it.str) continue;
      const rect = itemToNormRect(it, viewport.width, viewport.height);
      const str = it.str;

      // Gap-aware space: avoid "C hargé" from per-glyph PDF items
      if (prev && !/\s$/.test(prev.str) && !/^\s/.test(str)) {
        const prevRect = prev.rect;
        const charW = Math.max(
          (prevRect?.w ?? 0.01) / Math.max(Array.from(prev.str || " ").length, 1),
          0.003
        );
        const prevEnd = (prevRect?.x ?? 0) + (prevRect?.w ?? 0);
        const dx = (rect?.x ?? 0) - prevEnd;
        if (dx > charW * 0.35) {
          text += " ";
          cursor += 1;
        }
      }

      const textStart = cursor;
      const textEnd = cursor + str.length;
      const item = {
        str,
        page: i,
        rect: rect || { x: 0, y: 0, w: 0, h: 0 },
        textStart,
        textEnd,
      };
      items.push(item);
      text += str;
      cursor = textEnd;
      prev = item;
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
  const layout = analyzePdfLayout(pagesGeo);
  let profilePhotoHint = false;
  let profileImagePreview = null;
  try {
    profilePhotoHint = await detectPdfProfilePhoto(doc);
  } catch {
    profilePhotoHint = false;
  }
  if (profilePhotoHint) {
    try {
      profileImagePreview = await extractPdfProfileImagePreview(doc);
    } catch {
      profileImagePreview = null;
    }
  }

  let pdfCreator = null;
  let pdfProducer = null;
  try {
    const meta = await doc.getMetadata();
    const info = meta?.info || {};
    pdfCreator = info.Creator ? String(info.Creator) : null;
    pdfProducer = info.Producer ? String(info.Producer) : null;
  } catch {
    /* metadata optional */
  }

  return {
    text,
    pages: doc.numPages,
    format: "pdf",
    pdfDoc: doc,
    pagesGeo,
    html: null,
    approximate,
    tableCount: layout.tableCount,
    tableHint: layout.tableHint,
    headerSparse: layout.headerSparse,
    readingOrderOk: layout.readingOrderOk,
    imageOnlyPages: layout.imageOnlyPages || [],
    profilePhotoHint,
    profileImagePreview,
    pdfCreator,
    pdfProducer,
    originalBuffer,
    objectUrl,
  };
}

/**
 * Heuristique photo de profil : images peintes dans le bandeau haut page 1.
 * @param {any} pdfDoc
 */
export async function detectPdfProfilePhoto(pdfDoc) {
  if (!pdfDoc?.numPages) return false;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const fns = ops.fnArray || [];
  const args = ops.argsArray || [];
  const OPS = window.pdfjsLib?.OPS;
  const paintIds = new Set();
  const transformId = OPS?.transform;
  if (OPS) {
    [
      "paintImageXObject",
      "paintInlineImageXObject",
      "paintImageMaskXObject",
      "paintImageXObjectRepeat",
      "paintInlineImageXObjectGroup",
    ].forEach((k) => {
      if (typeof OPS[k] === "number") paintIds.add(OPS[k]);
    });
  } else {
    [85, 86, 83, 84, 87].forEach((n) => paintIds.add(n));
  }

  // Best-effort CTM y tracking to prefer header-band images (y < ~0.35 from top)
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let topBandImages = 0;
  let anyImages = 0;
  const pageH = viewport.height || 1;

  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i];
    if (OPS?.save === fn) {
      stack.push(ctm.slice());
      continue;
    }
    if (OPS?.restore === fn) {
      ctm = stack.pop() || ctm;
      continue;
    }
    if (transformId != null && fn === transformId && Array.isArray(args[i]) && args[i].length >= 6) {
      const m = args[i];
      // Multiply CTM: new = m × ctm (pdf.js order)
      const a = m[0] * ctm[0] + m[1] * ctm[2];
      const b = m[0] * ctm[1] + m[1] * ctm[3];
      const c = m[2] * ctm[0] + m[3] * ctm[2];
      const d = m[2] * ctm[1] + m[3] * ctm[3];
      const e = m[4] * ctm[0] + m[5] * ctm[2] + ctm[4];
      const f = m[4] * ctm[1] + m[5] * ctm[3] + ctm[5];
      ctm = [a, b, c, d, e, f];
      continue;
    }
    if (!paintIds.has(fn)) continue;
    anyImages += 1;
    // PDF y grows upward; top band ≈ high y. Normalize to top-from-page fraction.
    const yFromTop = 1 - (ctm[5] || 0) / pageH;
    const absScale = Math.abs(ctm[0] || 0) + Math.abs(ctm[3] || 0);
    const smallish = absScale === 0 || absScale < pageH * 0.9;
    if (yFromTop < 0.35 || (anyImages <= 2 && smallish)) {
      topBandImages += 1;
    }
  }

  if (topBandImages >= 1 && topBandImages <= 4) return true;
  // Fallback without reliable CTM: 1–3 images on page 1 often = photo/logo
  if (!OPS && anyImages >= 1 && anyImages <= 3) return true;
  return false;
}

/**
 * Capture bandeau haut page 1 (JPEG base64) pour classification photo distante.
 * @param {any} pdfDoc
 * @returns {Promise<{ base64: string, mime: string }|null>}
 */
export async function extractPdfProfileImagePreview(pdfDoc) {
  if (!pdfDoc?.numPages || typeof document === "undefined") return null;
  const page = await pdfDoc.getPage(1);
  const scale = 1.15;
  const viewport = page.getViewport({ scale });
  const cropH = Math.max(40, Math.floor(viewport.height * 0.35));
  const full = document.createElement("canvas");
  full.width = Math.floor(viewport.width);
  full.height = Math.floor(viewport.height);
  const fullCtx = full.getContext("2d");
  if (!fullCtx) return null;
  await page.render({ canvasContext: fullCtx, viewport }).promise;
  const canvas = document.createElement("canvas");
  canvas.width = full.width;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(full, 0, 0, full.width, cropH, 0, 0, canvas.width, cropH);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, "");
  if (!base64 || base64.length < 80) return null;
  return { base64, mime: "image/jpeg" };
}

/**
 * Heuristiques layout PDF : tableaux / bandeau contact / ordre de lecture / pages image.
 * @param {PageGeo[]} pagesGeo
 */
export function analyzePdfLayout(pagesGeo) {
  const pages = Array.isArray(pagesGeo) ? pagesGeo : [];
  if (!pages.length) {
    return {
      tableCount: 0,
      tableHint: false,
      headerSparse: false,
      readingOrderOk: true,
      imageOnlyPages: [],
    };
  }

  const page1 = pages[0];
  const items = (page1?.items || []).filter((it) => it.str?.trim() && it.rect);

  // Table detection across all pages (count how many pages look tabular)
  let tablePages = 0;
  for (const pg of pages) {
    const pgItems = (pg.items || []).filter((it) => it.str?.trim() && it.rect);
    if (detectTableHint(pgItems)) tablePages += 1;
  }
  const tableHint = tablePages > 0;
  const tableCount = tablePages;

  // Contact header density: few items in top band while body is rich → likely graphic header
  const headerItems = items.filter((it) => (it.rect?.y ?? 1) < 0.12);
  const bodyItems = items.filter((it) => (it.rect?.y ?? 0) >= 0.12);
  const headerChars = headerItems.reduce((n, it) => n + (it.str?.trim().length || 0), 0);
  const headerSparse = bodyItems.length >= 20 && headerItems.length <= 2 && headerChars < 12;

  // Reading order: fail if any early page diverges
  let readingOrderOk = true;
  for (const pg of pages.slice(0, 2)) {
    if (detectReadingOrderDivergence(pg)) {
      readingOrderOk = false;
      break;
    }
  }

  const imageOnlyPages = detectImageOnlyPages(pages);

  return { tableCount, tableHint, headerSparse, readingOrderOk, imageOnlyPages };
}

/**
 * Pages avec très peu de texte extractible → scan / image dominante.
 * @param {PageGeo[]} pagesGeo
 * @returns {number[]}
 */
function detectImageOnlyPages(pagesGeo) {
  const out = [];
  for (const pg of pagesGeo || []) {
    const items = (pg.items || []).filter((it) => (it.str || "").trim());
    const chars = items.reduce((n, it) => n + (it.str || "").trim().length, 0);
    // Quasi-empty text page (typical scanned CV page)
    if (items.length <= 4 && chars < 40) {
      out.push(pg.page || out.length + 1);
    }
  }
  return out;
}

/**
 * Grille / fragments courts alignés → indices de tableau.
 * Distingue grille régulière (tableau) des simples colonnes (2 blocs).
 * @param {TextItem[]} items
 */
function detectTableHint(items) {
  if (!items || items.length < 12) return false;
  // Bucket by Y row
  const rows = new Map();
  for (const it of items) {
    const yKey = Math.round((it.rect?.y ?? 0) * 50) / 50; // ~0.02 bands
    if (!rows.has(yKey)) rows.set(yKey, []);
    rows.get(yKey).push(it);
  }
  let multiColRows = 0;
  let shortFragRows = 0;
  let threePlusCellRows = 0;
  for (const row of rows.values()) {
    if (row.length < 3) continue;
    threePlusCellRows += 1;
    const xs = row.map((r) => r.rect.x).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const regular =
      gaps.length >= 2 &&
      gaps.every((g) => Math.abs(g - avgGap) < Math.max(0.035, avgGap * 0.4));
    // ≥3 cells spanning width → table grid (not just 2-column sidebar)
    if (regular && row.length >= 3 && xs[xs.length - 1] - xs[0] > 0.4) multiColRows += 1;
    const short = row.filter((r) => (r.str || "").trim().length <= 12).length;
    if (short >= 3 && row.length >= 3) shortFragRows += 1;
  }
  // Stronger: need grid evidence (3+ aligned rows) not just 2-column layout
  if (multiColRows >= 3) return true;
  if (shortFragRows >= 4 && threePlusCellRows >= 3) return true;
  // Dense micro-fragments overall (cell-like tokens)
  const micro = items.filter((it) => (it.str || "").trim().length <= 4).length;
  if (micro >= 28 && micro / items.length > 0.38 && threePlusCellRows >= 2) return true;
  return false;
}

/**
 * Compare ordre d'extraction (textStart) vs ordre géométrique (y puis x).
 * Divergence forte → colonnes / sidebar.
 * @param {PageGeo} page
 */
function detectReadingOrderDivergence(page) {
  const items = (page.items || []).filter((it) => it.str?.trim() && it.rect && it.textStart != null);
  if (items.length < 16) return false;
  const byExtract = [...items].sort((a, b) => a.textStart - b.textStart);
  const byGeo = [...items].sort(
    (a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x)
  );
  // Kendall-ish: count pairwise inversions on a sample of indices
  let disagree = 0;
  let compared = 0;
  const n = Math.min(byExtract.length, 80);
  const geoRank = new Map(byGeo.map((it, i) => [it, i]));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j += Math.max(1, Math.floor(n / 20))) {
      compared += 1;
      const ri = geoRank.get(byExtract[i]);
      const rj = geoRank.get(byExtract[j]);
      if (ri != null && rj != null && ri > rj) disagree += 1;
    }
  }
  if (!compared) return false;
  return disagree / compared > 0.28;
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

/**
 * Photo / image en tête DOCX (drawing/blip dans le début du document ou header).
 * @param {ArrayBuffer} arrayBuffer
 * @param {string} html
 */
export function detectDocxProfilePhoto(arrayBuffer, html) {
  try {
    const PizZip = window.PizZip || window.JSZip;
    if (PizZip) {
      const zip = new PizZip(arrayBuffer);
      const headerFiles = Object.keys(zip.files || {}).filter((n) =>
        /word\/header\d*\.xml$/i.test(n)
      );
      for (const name of headerFiles) {
        const xml = zip.file(name)?.asText?.() || "";
        if (/<w:drawing[\s>]|<a:blip[\s>]/i.test(xml)) return true;
      }
      const docXml = zip.file("word/document.xml")?.asText?.() || "";
      // First ~8k of body: early drawings often = profile photo
      const head = docXml.slice(0, 12000);
      const drawings = (head.match(/<w:drawing[\s>]/gi) || []).length;
      const blips = (head.match(/<a:blip[\s>]/gi) || []).length;
      if (drawings >= 1 || blips >= 1) return true;
    }
  } catch {
    /* fall through */
  }
  // HTML from mammoth: early <img>
  const early = String(html || "").slice(0, 2500);
  return /<img[\s>]/i.test(early);
}

/**
 * Première image média DOCX (header / début) → base64 pour classification.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ base64: string, mime: string }|null}
 */
export function extractDocxProfileImagePreview(arrayBuffer) {
  try {
    const PizZip = window.PizZip || window.JSZip;
    if (!PizZip || !arrayBuffer) return null;
    const zip = new PizZip(arrayBuffer);
    const media = Object.keys(zip.files || {})
      .filter((n) => /^word\/media\//i.test(n) && /\.(png|jpe?g|webp|gif)$/i.test(n))
      .sort();
    if (!media.length) return null;
    const name = media[0];
    const file = zip.file(name);
    if (!file) return null;
    const u8 = file.asUint8Array?.() || null;
    if (!u8 || !u8.length || u8.length > 1_500_000) return null;
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      binary += String.fromCharCode(...u8.subarray(i, i + chunk));
    }
    const ext = name.split(".").pop()?.toLowerCase() || "jpeg";
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    return { base64: btoa(binary), mime };
  } catch {
    return null;
  }
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
  const profilePhotoHint = detectDocxProfilePhoto(arrayBuffer, html);
  const profileImagePreview = profilePhotoHint ? extractDocxProfileImagePreview(arrayBuffer) : null;
  return {
    text,
    pages: null,
    format: "docx",
    pdfDoc: null,
    pagesGeo: [],
    html,
    approximate: true,
    tableCount,
    tableHint: tableCount > 0,
    profilePhotoHint,
    profileImagePreview,
    imageOnlyPages: [],
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
    profilePhotoHint: false,
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
