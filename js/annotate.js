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
        box.className = `ann-box severity-${ann.severity || "info"}${
          ann.id === selectedId ? " is-selected" : ""
        }${ann.status === "accepted" ? " is-accepted" : ""}${
          ann.approximate ? " is-approx" : ""
        }`;
        box.dataset.id = ann.id;
        box.style.left = `${r.x * 100}%`;
        box.style.top = `${r.y * 100}%`;
        box.style.width = `${r.w * 100}%`;
        box.style.height = `${Math.max(r.h * 100, 1.2)}%`;
        box.setAttribute(
          "aria-label",
          `Annotation ${ann.id.replace("ann-", "")} : ${ann.title}${
            ann.approximate ? " (zone approximative)" : ""
          }`
        );
        if (ri === 0) {
          const badge = document.createElement("span");
          badge.className = "ann-badge";
          badge.textContent = ann.id.replace("ann-", "");
          box.appendChild(badge);
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
    mark.addEventListener("click", (e) => {
      e.preventDefault();
      onSelect?.(ann.id);
    });

    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    frag.appendChild(mark);
    if (after) frag.appendChild(document.createTextNode(after));
    node.parentNode.replaceChild(frag, node);
    return; // un seul split par passe — rebuild index after
  }
}

/**
 * Rend le HTML DOCX avec highlights.
 * Mapping offsets : on aligne sur le textContent sans espaces multiples.
 */
export function renderHtmlPreview(container, html, plainText, annotations, opts = {}) {
  container.innerHTML = "";
  container.classList.add("cv-preview-html");
  const article = document.createElement("article");
  article.className = "cv-html-doc";
  article.innerHTML = html || "<p>(aperçu indisponible)</p>";
  container.appendChild(article);

  const selectedId = opts.selectedId || null;
  const active = (annotations || []).filter((a) => a.status !== "ignored");

  // Map annotation offsets from plainText onto article.textContent via fuzzy quote search
  for (const ann of active) {
    const quote = ann.quote;
    if (!quote || quote.startsWith("(")) {
      // bandeau approximatif en tête
      const banner = document.createElement("button");
      banner.type = "button";
      banner.className = `ann-approx-banner severity-${ann.severity}${
        ann.id === selectedId ? " is-selected" : ""
      }`;
      banner.dataset.id = ann.id;
      banner.textContent = `≈ ${ann.title}`;
      banner.setAttribute(
        "aria-label",
        `Annotation ${ann.id.replace("ann-", "")} : ${ann.title} (zone approximative)`
      );
      banner.addEventListener("click", () => opts.onSelect?.(ann.id));
      article.prepend(banner);
      continue;
    }

    // Cherche la quote dans le DOM text
    let applied = false;
    for (let pass = 0; pass < 3 && !applied; pass++) {
      const index = buildTextIndex(article);
      const hay = index.nodes.map((n) => n.node.nodeValue).join("");
      let idx = hay.indexOf(quote);
      if (idx === -1) idx = hay.toLowerCase().indexOf(quote.toLowerCase());
      if (idx === -1) break;
      const beforeCount = index.nodes.length;
      highlightRange(index, idx, idx + quote.length, ann, opts.onSelect, selectedId);
      applied = buildTextIndex(article).nodes.length !== beforeCount || true;
      break;
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
