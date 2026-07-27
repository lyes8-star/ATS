/**
 * Studio CV annoté — split view, accept/ignore/edit, barre d'actions.
 * Expérience principale après analyse.
 */
import {
  renderPdfPreview,
  renderHtmlPreview,
  scrollPreviewToAnnotation,
} from "./annotate.js";
import { applyAll, updateAnnotation } from "./optimize.js";
import { downloadAtsHtml, openPrintableCv } from "./export-cv.js";
import { analyzeCv } from "./analyzer.js";

/**
 * @typedef {object} StudioSession
 * @property {File} originalFile
 * @property {import('./extract.js').ExtractResult} extracted
 * @property {object} report
 * @property {object[]} annotations
 * @property {string|null} selectedId
 * @property {string|null} optimizedText
 * @property {object|null} retestReport
 * @property {number|null} scoreBefore
 * @property {boolean} [previewOptimized]
 */

/**
 * Monte le studio dans un conteneur.
 * @param {HTMLElement} root
 * @param {StudioSession} session
 * @param {{ onReset?: () => void, onRetest?: (report: object, optimized: string) => void, onShowReport?: () => void }} hooks
 */
export async function mountStudio(root, session, hooks = {}) {
  session.annotations = (session.annotations || []).map((a) => ({
    ...a,
    status: a.status || "pending",
  }));
  session.selectedId = session.selectedId || session.annotations[0]?.id || null;
  session.scoreBefore = session.report?.total ?? null;
  session.previewOptimized = !!session.previewOptimized;

  root.innerHTML = studioShell(session);
  bindStudio(root, session, hooks);
  await refreshPreview(root, session);
  renderList(root, session);
  renderDetail(root, session);
  updateBar(root, session);
}

function studioShell(session) {
  const t = window.ATSi18n?.t || ((k) => k);
  const total = session.report?.total ?? "—";
  const label = session.report?.label?.text ?? "";
  return `
  <div class="studio" id="studio">
    <div class="studio-score-strip">
      <div class="studio-score-main">
        <p class="studio-kicker">${escapeHtml(t("studio.kicker"))}</p>
        <p class="studio-score-line">${escapeHtml(t("studio.score.initial"))} <strong id="studio-score-before">${total}</strong>/100 <span class="studio-label">${escapeHtml(label)}</span></p>
        <p id="studio-count" class="studio-count-inline"></p>
      </div>
      <div class="studio-score-actions">
        <p class="studio-hint">${escapeHtml(t("studio.hint"))}</p>
        <button type="button" class="studio-report-link" id="btn-show-report">${escapeHtml(t("studio.link.report"))}</button>
      </div>
    </div>
    <div class="studio-split">
      <div class="studio-preview-col">
        <div id="cv-preview" class="cv-preview" tabindex="0" aria-label="Prévisualisation du CV annoté"></div>
      </div>
      <aside class="studio-side" aria-label="Suggestions">
        <div class="studio-side-head">
          <h2>${escapeHtml(t("studio.side.title"))}</h2>
        </div>
        <div id="ann-list" class="ann-list" role="listbox" aria-label="Liste des annotations"></div>
        <div id="ann-detail" class="ann-detail"></div>
      </aside>
    </div>
    <div class="studio-bar" role="region" aria-label="Actions d'optimisation">
      <p id="studio-bar-count" class="studio-bar-count"></p>
      <div class="studio-bar-actions">
        <button type="button" class="btn-secondary" id="btn-accept-all">${escapeHtml(t("studio.acceptAll"))}</button>
        <button type="button" class="btn-secondary" id="btn-generate" disabled>${escapeHtml(t("studio.generate.button"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-download">${escapeHtml(t("studio.actions.download"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-print">${escapeHtml(t("studio.actions.print"))}</button>
        <button type="button" class="analyze-btn hidden" id="btn-retest">${escapeHtml(t("studio.actions.retest"))}</button>
      </div>
    </div>
    <div id="retest-banner" class="retest-banner hidden" role="status"></div>
  </div>`;
}

function bindStudio(root, session, hooks) {
  root.querySelector("#btn-show-report")?.addEventListener("click", () => {
    hooks.onShowReport?.();
  });

  root.querySelector("#btn-accept-all")?.addEventListener("click", () => {
    // Remplacements sûrs uniquement (typos / passifs / métriques replace)
    const safeKinds = new Set(["typo", "passive_verb", "missing_metric"]);
    let changed = 0;
    session.annotations = session.annotations.map((a) => {
      if (
        a.status === "pending" &&
        a.applyMode === "replace" &&
        (safeKinds.has(a.kind) || a.kind === "typo")
      ) {
        changed += 1;
        return { ...a, status: "accepted" };
      }
      return a;
    });
    if (changed) {
      window.ATSAnalytics?.track?.("ats_accept_all", { count: changed });
      afterDecision(root, session);
    }
  });

  root.querySelector("#btn-generate")?.addEventListener("click", () => {
    const { text } = applyAll(session.extracted.text, session.annotations);
    session.optimizedText = text;
    root.querySelector("#btn-download")?.classList.remove("hidden");
    root.querySelector("#btn-print")?.classList.remove("hidden");
    root.querySelector("#btn-retest")?.classList.remove("hidden");
    window.ATSAnalytics?.track?.("ats_cv_generated", {
      accepted: session.annotations.filter((a) => a.status === "accepted").length,
    });
    runRetest(root, session, hooks);
  });

  root.querySelector("#btn-download")?.addEventListener("click", () => {
    if (!session.optimizedText) return;
    downloadAtsHtml(session.optimizedText, {
      fileName: session.originalFile?.name,
      scoreBefore: session.scoreBefore,
      scoreAfter: session.retestReport?.total,
    });
  });

  root.querySelector("#btn-print")?.addEventListener("click", () => {
    if (!session.optimizedText) return;
    openPrintableCv(session.optimizedText, {
      fileName: session.originalFile?.name,
      scoreBefore: session.scoreBefore,
      scoreAfter: session.retestReport?.total,
    });
  });

  root.querySelector("#btn-retest")?.addEventListener("click", () => {
    if (!session.optimizedText) {
      const { text } = applyAll(session.extracted.text, session.annotations);
      session.optimizedText = text;
    }
    runRetest(root, session, hooks);
  });
}

function textToPreviewHtml(text) {
  const esc = escapeHtml(text || "");
  const blocks = esc
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      if (!lines.length) return "";
      if (lines.length === 1) return `<p>${lines[0]}</p>`;
      return `<p>${lines.join("<br>")}</p>`;
    })
    .join("");
  return `<div class="cv-html-doc cv-html-optimized">${blocks || "<p></p>"}</div>`;
}

function runRetest(root, session, hooks) {
  try {
    const t = window.ATSi18n?.t || ((k) => k);
    const report = analyzeCv(session.optimizedText, {
      fileName: session.originalFile?.name || "cv-optimise",
      pages: estimatePagesFromText(session.optimizedText),
      lang: window.ATSi18n?.getLang?.() || "fr",
    });
    session.retestReport = report;
    const before = session.scoreBefore ?? 0;
    const after = report.total;
    const delta = after - before;
    const ready = report.passes || after >= 70;
    const banner = root.querySelector("#retest-banner");
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `
        <div class="retest-inner">
          <p class="retest-delta">Score <strong>${before}</strong> → <strong>${after}</strong>
            <span class="${delta >= 0 ? "delta-up" : "delta-down"}">(${delta >= 0 ? "+" : ""}${delta})</span>
          </p>
          <p>${
            ready
              ? t("studio.retest.ready")
              : report.passes
                ? t("studio.retest.pass")
                : t("studio.retest.continue")
          }</p>
          <div class="retest-actions">
            ${
              ready
                ? `<button type="button" class="analyze-btn" id="btn-retest-download">${escapeHtml(
                    t("studio.actions.download")
                  )}</button>
                   <button type="button" class="btn-secondary" id="btn-retest-print">${escapeHtml(
                     t("studio.actions.print")
                   )}</button>`
                : ""
            }
            <button type="button" class="btn-secondary" id="btn-continue-opt">${escapeHtml(
              t("studio.retest.continueButton")
            )}</button>
          </div>
        </div>`;
      banner.querySelector("#btn-retest-download")?.addEventListener("click", () => {
        downloadAtsHtml(session.optimizedText, {
          fileName: session.originalFile?.name,
          scoreBefore: before,
          scoreAfter: after,
        });
      });
      banner.querySelector("#btn-retest-print")?.addEventListener("click", () => {
        openPrintableCv(session.optimizedText, {
          fileName: session.originalFile?.name,
          scoreBefore: before,
          scoreAfter: after,
        });
      });
      banner.querySelector("#btn-continue-opt")?.addEventListener("click", () => {
        banner.classList.add("hidden");
        // Preview HTML du texte optimisé (plus le PDF original — évite dérive géométrie)
        const freshAnns = (report.annotations || []).map((a) => ({
          ...a,
          status: "pending",
          approximate: true,
          placement: a.applyMode === "replace" ? "approx" : "insert",
          rects: [],
        }));
        session.annotations = freshAnns;
        session.report = report;
        session.selectedId = session.annotations[0]?.id || null;
        session.scoreBefore = after;
        session.previewOptimized = true;
        session.extracted = {
          ...session.extracted,
          text: session.optimizedText,
          html: textToPreviewHtml(session.optimizedText),
          format: "html",
          pdfDoc: null,
          pagesGeo: [],
          approximate: true,
        };
        const scoreEl = root.querySelector("#studio-score-before");
        if (scoreEl) scoreEl.textContent = String(after);
        refreshPreview(root, session);
        renderList(root, session);
        renderDetail(root, session);
        updateBar(root, session);
      });
    }
    // Mettre en avant download/print après retest
    root.querySelector("#btn-download")?.classList.remove("hidden");
    root.querySelector("#btn-print")?.classList.remove("hidden");
    window.ATSAnalytics?.track?.("ats_retest", { before, after, delta });
    hooks.onRetest?.(report, session.optimizedText);
  } catch (err) {
    console.error(err);
    const banner = root.querySelector("#retest-banner");
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<p role="alert">${escapeHtml(err.message || "Retest impossible")}</p>`;
    }
  }
}

function estimatePagesFromText(text) {
  const words = (text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 450));
}

async function refreshPreview(root, session) {
  const preview = root.querySelector("#cv-preview");
  if (!preview) return;
  const onSelect = (id) => {
    session.selectedId = id;
    renderList(root, session);
    renderDetail(root, session);
    highlightSelection(root, session);
    scrollPreviewToAnnotation(preview, id);
    root.querySelector(`.ann-item[data-id="${id}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  };

  const usePdf =
    !session.previewOptimized &&
    session.extracted.format === "pdf" &&
    session.extracted.pdfDoc;

  if (usePdf) {
    await renderPdfPreview(preview, session.extracted.pdfDoc, session.annotations, {
      onSelect,
      selectedId: session.selectedId,
    });
  } else {
    const html =
      session.extracted.html || textToPreviewHtml(session.extracted.text || "");
    renderHtmlPreview(
      preview,
      html,
      session.extracted.text,
      session.annotations,
      { onSelect, selectedId: session.selectedId }
    );
  }
}

function highlightSelection(root, session) {
  root.querySelectorAll(".ann-box, .ann-mark, .ann-approx-banner, .ann-item").forEach((el) => {
    el.classList.toggle("is-selected", el.dataset.id === session.selectedId);
  });
}

function placementMeta(a, t) {
  if (a.placement === "insert" || a.applyMode === "insert_header" || a.applyMode === "insert_after") {
    return ` · ${t("studio.insertProposed")}`;
  }
  if (a.approximate) return ` · ${t("studio.zoneApprox")}`;
  return "";
}

function renderList(root, session) {
  const list = root.querySelector("#ann-list");
  const count = root.querySelector("#studio-count");
  const barCount = root.querySelector("#studio-bar-count");
  if (!list) return;
  const t = window.ATSi18n?.t || ((k) => k);
  const pending = session.annotations.filter((a) => a.status === "pending").length;
  const accepted = session.annotations.filter((a) => a.status === "accepted").length;
  const countText = t("studio.side.count", {
    total: session.annotations.length,
    accepted,
    pending,
  });
  if (count) count.textContent = countText;
  if (barCount) barCount.textContent = countText;

  list.innerHTML = session.annotations
    .map((a, i) => {
      const num = a.id.replace("ann-", "") || String(i + 1);
      return `
      <button type="button" class="ann-item severity-${a.severity} status-${a.status}${
        a.id === session.selectedId ? " is-selected" : ""
      }" data-id="${a.id}" role="option" aria-selected="${a.id === session.selectedId}">
        <span class="ann-num">${escapeHtml(num)}</span>
        <span class="ann-item-body">
          <strong>${escapeHtml(a.title)}</strong>
          <span class="ann-meta">${escapeHtml(a.section || "")}${placementMeta(a, t)}${
            a.page ? ` · p.${a.page}` : ""
          }</span>
        </span>
        <span class="ann-status-pill">${statusLabel(a.status)}</span>
      </button>`;
    })
    .join("");

  list.querySelectorAll(".ann-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      session.selectedId = btn.dataset.id;
      renderList(root, session);
      renderDetail(root, session);
      highlightSelection(root, session);
      const preview = root.querySelector("#cv-preview");
      if (preview) scrollPreviewToAnnotation(preview, session.selectedId);
    });
  });
}

function statusLabel(s) {
  const t = window.ATSi18n?.t || ((k) => k);
  if (s === "accepted") return t("studio.accepted");
  if (s === "ignored") return t("studio.ignored");
  return t("studio.pending");
}

function renderDetail(root, session) {
  const detail = root.querySelector("#ann-detail");
  if (!detail) return;
  const ann = session.annotations.find((a) => a.id === session.selectedId);
  const t = window.ATSi18n?.t || ((k) => k);
  if (!ann) {
    detail.innerHTML = `<p class="ann-empty">${escapeHtml(
      t("studio.detail.empty")
    )}</p>`;
    return;
  }

  const placementNote =
    ann.placement === "insert" ||
    ann.applyMode === "insert_header" ||
    ann.applyMode === "insert_after"
      ? `<p class="ann-placement">${escapeHtml(t("studio.insertProposed"))}</p>`
      : ann.approximate
        ? `<p class="ann-placement">${escapeHtml(t("studio.zoneApprox"))}</p>`
        : "";

  detail.innerHTML = `
    <div class="ann-detail-card severity-${ann.severity}">
      <p class="ann-where"><span>${escapeHtml(t("studio.detail.where"))}</span> ${
        ann.page ? `Page ${ann.page}` : "Document"
      }${ann.section ? ` · ${escapeHtml(ann.section)}` : ""}</p>
      ${placementNote}
      <p class="ann-quote">« ${escapeHtml(ann.quote || "")} »</p>
      <h3>${escapeHtml(ann.title)}</h3>
      <p class="ann-problem">${escapeHtml(ann.detail || "")}</p>
      <label class="ann-suggest-label" for="ann-suggest-input">${escapeHtml(t("studio.detail.correction"))}</label>
      <textarea id="ann-suggest-input" class="ann-suggest" rows="3">${escapeHtml(ann.suggestion || "")}</textarea>
      <div class="ann-actions">
        <button type="button" class="analyze-btn" id="btn-accept">${escapeHtml(t("studio.actions.accept"))}</button>
        <button type="button" class="btn-ghost-text" id="btn-edit-accept">${escapeHtml(t("studio.actions.editAccept"))}</button>
        <button type="button" class="btn-secondary" id="btn-ignore">${escapeHtml(t("studio.actions.ignore"))}</button>
      </div>
    </div>`;

  const input = detail.querySelector("#ann-suggest-input");
  const originalSuggestion = ann.suggestion || "";

  // Accepter = suggestion d'origine (ignore les edits textarea non validés via "Modifier")
  detail.querySelector("#btn-accept")?.addEventListener("click", () => {
    session.annotations = updateAnnotation(session.annotations, ann.id, {
      status: "accepted",
      suggestion: originalSuggestion,
    });
    afterDecision(root, session);
  });

  // Modifier puis accepter = utilise le contenu édité du textarea
  detail.querySelector("#btn-edit-accept")?.addEventListener("click", () => {
    if (document.activeElement !== input) {
      input?.focus();
      input?.classList.add("is-editing");
      input?.select?.();
      // Premier clic : focus pour éditer ; second clic (déjà focus) ou si déjà modifié → accept
      if ((input?.value ?? "") === originalSuggestion) {
        return;
      }
    }
    session.annotations = updateAnnotation(session.annotations, ann.id, {
      status: "accepted",
      suggestion: input?.value ?? ann.suggestion,
    });
    afterDecision(root, session);
  });

  detail.querySelector("#btn-ignore")?.addEventListener("click", () => {
    session.annotations = updateAnnotation(session.annotations, ann.id, {
      status: "ignored",
    });
    afterDecision(root, session);
  });
}

async function afterDecision(root, session) {
  const next = session.annotations.find((a) => a.status === "pending");
  session.selectedId = next?.id || session.selectedId;
  await refreshPreview(root, session);
  renderList(root, session);
  renderDetail(root, session);
  updateBar(root, session);
}

function updateBar(root, session) {
  const total = session.annotations.length;
  const accepted = session.annotations.filter((a) => a.status === "accepted").length;
  const pending = session.annotations.filter((a) => a.status === "pending").length;
  const t = window.ATSi18n?.t || ((k) => k);
  const bar = root.querySelector("#studio-bar-count");
  const count = root.querySelector("#studio-count");
  const text = t("studio.side.count", { total, accepted, pending });
  if (bar) bar.textContent = text;
  if (count) count.textContent = text;
  const gen = root.querySelector("#btn-generate");
  if (gen) gen.disabled = accepted === 0;
  const acceptAll = root.querySelector("#btn-accept-all");
  if (acceptAll) {
    const safePending = session.annotations.some(
      (a) =>
        a.status === "pending" &&
        a.applyMode === "replace" &&
        (a.kind === "typo" || a.kind === "passive_verb" || a.kind === "missing_metric")
    );
    acceptAll.disabled = !safePending;
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
