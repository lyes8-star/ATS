/**
 * Overlays d'annotation — PDF (rects) + DOCX/HTML (highlights offsets).
 */

/**
 * Rend les pages PDF en canvas + couches d'annotation.
 * @param {HTMLElement} container
 * @param {any} pdfDoc
 * @param {object[]} annotations
 * @param {{ onSelect?: (id: string) => void, selectedId?: string|null, scale?: number }} opts
 */
export async function renderPdfPreview(container, pdfDoc, annotations, opts = {}) {
  container.innerHTML = "";
  container.classList.add("cv-preview-pdf");
  const scale = opts.scale || 1.25;
  const selectedId = opts.selectedId || null;
  const t = window.ATSi18n?.t || ((k) => k);

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const wrap = document.createElement("div");
    wrap.className = "cv-page";
    wrap.dataset.page = String(i);
    wrap.style.width = `${viewport.width}px`;
    wrap.style.height = `${viewport.height}px`;

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.setAttribute("aria-label", `Page ${i} du CV`);
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const overlay = document.createElement("div");
    overlay.className = "cv-overlay";
    overlay.setAttribute("aria-hidden", "false");

    const pageAnns = (annotations || []).filter(
      (a) => a.status !== "ignored" && (a.page || 1) === i
    );
    pageAnns.forEach((ann, idx) => {
      const rects = ann.rects?.length
        ? ann.rects
        : [{ x: 0.05, y: 0.05 + idx * 0.05, w: 0.9, h: 0.04 }];
      rects.forEach((r, ri) => {
        const box = document.createElement("button");
        box.type = "button";
        const isInsert = ann.placement === "insert" || ann.applyMode === "insert_header" || ann.applyMode === "insert_after";
        box.className = `ann-box severity-${ann.severity || "info"}${
          ann.id === selectedId ? " is-selected" : ""
        }${ann.status === "accepted" ? " is-accepted" : ""}${
          ann.approximate ? " is-approx" : ""
        }${isInsert ? " is-insert" : ""}`;
        box.dataset.id = ann.id;
        box.style.left = `${r.x * 100}%`;
        box.style.top = `${r.y * 100}%`;
        box.style.width = `${r.w * 100}%`;
        box.style.height = `${Math.max(r.h * 100, 1.2)}%`;
        const zoneHint = isInsert
          ? t("studio.insertProposed")
          : ann.approximate
            ? t("studio.zoneApprox")
            : "";
        box.setAttribute(
          "aria-label",
          `Annotation ${ann.id.replace("ann-", "")} : ${ann.title}${
            zoneHint ? ` (${zoneHint})` : ""
          }`
        );
        if (ri === 0) {
          const badge = document.createElement("span");
          badge.className = "ann-badge";
          const num = ann.id.replace("ann-", "");
          const short = (ann.shortLabel || "").slice(0, 14);
          badge.textContent = short ? `${num} · ${short}` : num;
          badge.title = ann.title || "";
          box.appendChild(badge);
          if (ann.id === selectedId && ann.detail) {
            const tip = document.createElement("span");
            tip.className = "ann-callout";
            tip.textContent = ann.title;
            box.appendChild(tip);
          }
        }
        box.addEventListener("click", (e) => {
          e.preventDefault();
          opts.onSelect?.(ann.id);
        });
        overlay.appendChild(box);
      });
    });

    wrap.appendChild(canvas);
    wrap.appendChild(overlay);
    container.appendChild(wrap);
  }
}

/**
 * Construit une carte des offsets caractères → nœuds texte (TreeWalker).
 * @param {HTMLElement} root
 */
function buildTextIndex(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;
  let cursor = 0;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || "";
    if (!value) continue;
    nodes.push({ node, start: cursor, end: cursor + value.length });
    cursor += value.length;
  }
  return { nodes, length: cursor };
}

/**
 * Surligne un intervalle dans le DOM HTML DOCX.
 */
function highlightRange(index, start, end, ann, onSelect, selectedId) {
  for (const { node, start: ns, end: ne } of index.nodes) {
    if (ne <= start || ns >= end) continue;
    const localStart = Math.max(0, start - ns);
    const localEnd = Math.min(node.nodeValue.length, end - ns);
    if (localStart >= localEnd) continue;

    const text = node.nodeValue;
    const before = text.slice(0, localStart);
    const mid = text.slice(localStart, localEnd);
    const after = text.slice(localEnd);

    const mark = document.createElement("button");
    mark.type = "button";
    mark.className = `ann-mark severity-${ann.severity || "info"}${
      ann.id === selectedId ? " is-selected" : ""
    }${ann.status === "accepted" ? " is-accepted" : ""}`;
    mark.dataset.id = ann.id;
    mark.textContent = mid;
    mark.setAttribute("aria-label", `Annotation ${ann.id.replace("ann-", "")} : ${ann.title}`);
    mark.title = ann.title || "";
    if (ann.id === selectedId) {
      mark.dataset.callout = ann.title || "";
    }
    mark.addEventListener("click", (e) => {
      e.preventDefault();
      onSelect?.(ann.id);
    });

    // Callout next to selected mark
    const wrapMark = document.createElement("span");
    wrapMark.className = "ann-mark-wrap";
    wrapMark.appendChild(mark);
    if (ann.id === selectedId) {
      const tip = document.createElement("span");
      tip.className = "ann-callout ann-callout-inline";
      tip.textContent = ann.title || ann.shortLabel || "";
      wrapMark.appendChild(tip);
    }

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(wrapMark);
    if (after) frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag, node);
    return true;
  }
  return false;
}

function prependInsertBanner(article, ann, selectedId, onSelect, t) {
  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = `ann-approx-banner severity-${ann.severity}${
    ann.id === selectedId ? " is-selected" : ""
  }${ann.status === "accepted" ? " is-accepted" : ""}`;
  banner.dataset.id = ann.id;
  banner.textContent = `${t("studio.insertProposed")} — ${ann.title}`;
  banner.setAttribute(
    "aria-label",
    `Annotation ${ann.id.replace("ann-", "")} : ${ann.title} (${t("studio.insertProposed")})`
  );
  banner.addEventListener("click", () => onSelect?.(ann.id));
  article.prepend(banner);
}

/**
 * Aligne offsets plainText → textContent DOM (espaces collapsés côté HTML).
 * Construit une map char plain → char DOM via recherche progressive de tokens.
 */
function mapPlainOffsetsToDom(plainText, domText) {
  if (!plainText || !domText) return null;
  if (plainText === domText) {
    return (s, e) => ({ start: s, end: e });
  }
  // Build compression map: index in plain → index in a whitespace-normalized form
  const norm = (s) => s.replace(/\s+/g, " ");
  const plainN = norm(plainText);
  const domN = norm(domText);
  if (plainN === domN) {
    // Map via walking both with whitespace skipping
    return (start, end) => {
      let pi = 0;
      let di = 0;
      let domStart = -1;
      let domEnd = -1;
      while (pi < plainText.length && di < domText.length) {
        const pc = plainText[pi];
        const dc = domText[di];
        if (/\s/.test(pc) && /\s/.test(dc)) {
          while (pi < plainText.length && /\s/.test(plainText[pi])) pi += 1;
          while (di < domText.length && /\s/.test(domText[di])) di += 1;
          continue;
        }
        if (/\s/.test(pc)) {
          pi += 1;
          continue;
        }
        if (/\s/.test(dc)) {
          di += 1;
          continue;
        }
        if (pi === start) domStart = di;
        if (pc.toLowerCase() === dc.toLowerCase()) {
          pi += 1;
          di += 1;
          if (pi === end) {
            domEnd = di;
            break;
          }
        } else {
          // mismatch — abort map
          return { start: -1, end: -1 };
        }
      }
      if (domStart < 0) return { start: -1, end: -1 };
      if (domEnd < 0) domEnd = di;
      return { start: domStart, end: domEnd };
    };
  }
  return null;
}

/**
 * Rend le HTML DOCX avec highlights ancrés sur textStart/textEnd du plain text.
 */
export function renderHtmlPreview(container, html, plainText, annotations, opts = {}) {
  container.innerHTML = "";
  container.classList.add("cv-preview-html");
  const article = document.createElement("article");
  article.className = "cv-html-doc";
  article.innerHTML = html || "<p>(aperçu indisponible)</p>";
  container.appendChild(article);

  const selectedId = opts.selectedId || null;
  const t = window.ATSi18n?.t || ((k) => k);
  const active = (annotations || []).filter((a) => a.status !== "ignored");
  const index0 = buildTextIndex(article);
  const domHay = index0.nodes.map((n) => n.node.nodeValue).join("");
  const mapper = mapPlainOffsetsToDom(plainText || "", domHay);

  for (const ann of active) {
    const isInsert =
      ann.placement === "insert" ||
      ann.applyMode === "insert_header" ||
      ann.applyMode === "insert_after" ||
      !ann.quote ||
      String(ann.quote).startsWith("(");

    if (isInsert && (ann.applyMode === "insert_header" || ann.applyMode === "insert_after" || !ann.quote || String(ann.quote).startsWith("("))) {
      prependInsertBanner(article, ann, selectedId, opts.onSelect, t);
      continue;
    }

    let applied = false;
    // Prefer plainText offsets mapped into DOM
    if (mapper && ann.textStart != null && ann.textEnd != null) {
      const mapped = mapper(ann.textStart, ann.textEnd);
      if (mapped.start >= 0 && mapped.end > mapped.start) {
        const index = buildTextIndex(article);
        applied = highlightRange(index, mapped.start, mapped.end, ann, opts.onSelect, selectedId);
      }
    }

    // Fallback: quote search in DOM text
    if (!applied && ann.quote) {
      for (let pass = 0; pass < 3 && !applied; pass++) {
        const index = buildTextIndex(article);
        const hay = index.nodes.map((n) => n.node.nodeValue).join("");
        let idx = hay.indexOf(ann.quote);
        if (idx === -1) idx = hay.toLowerCase().indexOf(String(ann.quote).toLowerCase());
        if (idx === -1) break;
        applied = highlightRange(index, idx, idx + ann.quote.length, ann, opts.onSelect, selectedId);
        break;
      }
    }

    if (!applied) {
      prependInsertBanner(article, ann, selectedId, opts.onSelect, t);
    }
  }
}

/**
 * Scroll vers une annotation dans la preview.
 */
export function scrollPreviewToAnnotation(container, id) {
  const el =
    container.querySelector(`.ann-box[data-id="${id}"]`) ||
    container.querySelector(`.ann-mark[data-id="${id}"]`) ||
    container.querySelector(`.ann-approx-banner[data-id="${id}"]`);
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.focus?.({ preventScroll: true });
}
