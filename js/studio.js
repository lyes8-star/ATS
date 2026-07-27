/**
 * Studio CV annoté — split view, accept/ignore/edit, barre d'actions.
 */
import {
  renderPdfPreview,
  renderHtmlPreview,
  scrollPreviewToAnnotation,
} from "./annotate.js";
import { applyAll, updateAnnotation } from "./optimize.js";
import { downloadAtsHtml, openPrintableCv } from "./export-cv.js";
import { analyzeCv, attachGeometry } from "./analyzer.js";
import * as extractApi from "./extract.js";

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
 */

/**
 * Monte le studio dans un conteneur.
 * @param {HTMLElement} root
 * @param {StudioSession} session
 * @param {{ onReset?: () => void, onRetest?: (report: object, optimized: string) => void }} hooks
 */
export async function mountStudio(root, session, hooks = {}) {
  session.annotations = (session.annotations || []).map((a) => ({
    ...a,
    status: a.status || "pending",
  }));
  session.selectedId = session.selectedId || session.annotations[0]?.id || null;
  session.scoreBefore = session.report?.total ?? null;

  root.innerHTML = studioShell(session);
  bindStudio(root, session, hooks);
  await refreshPreview(root, session);
  renderList(root, session);
  renderDetail(root, session);
  updateBar(root, session);
}

function studioShell(session) {
  const total = session.report?.total ?? "—";
  const label = session.report?.label?.text ?? "";
  return `
  <div class="studio" id="studio">
    <div class="studio-score-strip">
      <div>
        <p class="studio-kicker">Atelier d'optimisation ATS</p>
        <p class="studio-score-line">Score initial <strong id="studio-score-before">${total}</strong>/100 <span class="studio-label">${escapeHtml(label)}</span></p>
      </div>
      <p class="studio-hint">Cliquez une zone colorée ou une suggestion pour corriger précisément.</p>
    </div>
    <div class="studio-split">
      <div class="studio-preview-col">
        <div id="cv-preview" class="cv-preview" tabindex="0" aria-label="Prévisualisation du CV annoté"></div>
      </div>
      <aside class="studio-side" aria-label="Suggestions">
        <div class="studio-side-head">
          <h2>Suggestions</h2>
          <p id="studio-count"></p>
        </div>
        <div id="ann-list" class="ann-list" role="listbox" aria-label="Liste des annotations"></div>
        <div id="ann-detail" class="ann-detail"></div>
      </aside>
    </div>
    <div class="studio-bar" role="region" aria-label="Actions d'optimisation">
      <p id="studio-bar-count" class="studio-bar-count"></p>
      <div class="studio-bar-actions">
        <button type="button" class="btn-secondary" id="btn-generate" disabled>Générer mon CV ATS optimisé</button>
        <button type="button" class="btn-secondary hidden" id="btn-download">Télécharger HTML</button>
        <button type="button" class="btn-secondary hidden" id="btn-print">Imprimer / PDF</button>
        <button type="button" class="analyze-btn hidden" id="btn-retest">Retester</button>
      </div>
    </div>
    <div id="retest-banner" class="retest-banner hidden" role="status"></div>
  </div>`;
}

function bindStudio(root, session, hooks) {
  root.querySelector("#btn-generate")?.addEventListener("click", () => {
    const { text } = applyAll(session.extracted.text, session.annotations);
    session.optimizedText = text;
    root.querySelector("#btn-download")?.classList.remove("hidden");
    root.querySelector("#btn-print")?.classList.remove("hidden");
    root.querySelector("#btn-retest")?.classList.remove("hidden");
    window.ATSAnalytics?.track?.("ats_cv_generated", {
      accepted: session.annotations.filter((a) => a.status === "accepted").length,
    });
    // Auto-retest
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

function runRetest(root, session, hooks) {
  try {
    const report = analyzeCv(session.optimizedText, {
      fileName: session.originalFile?.name || "cv-optimise",
      pages: estimatePagesFromText(session.optimizedText),
    });
    session.retestReport = report;
    const before = session.scoreBefore ?? 0;
    const after = report.total;
    const delta = after - before;
    const banner = root.querySelector("#retest-banner");
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `
        <div class="retest-inner">
          <p class="retest-delta">Score <strong>${before}</strong> → <strong>${after}</strong>
            <span class="${delta >= 0 ? "delta-up" : "delta-down"}">(${delta >= 0 ? "+" : ""}${delta})</span>
          </p>
          <p>${report.passes ? "Le CV optimisé passe mieux les filtres ATS." : "Continuez l'optimisation pour viser 70+."}</p>
          <button type="button" class="btn-secondary" id="btn-continue-opt">Continuer l'optimisation</button>
        </div>`;
      banner.querySelector("#btn-continue-opt")?.addEventListener("click", () => {
        banner.classList.add("hidden");
        // Remonter les annotations restantes du retest dans le studio
        const fresh = attachGeometry(report.annotations || [], session.extracted.pagesGeo, extractApi);
        session.annotations = fresh.map((a) => ({ ...a, status: "pending" }));
        session.report = report;
        session.selectedId = session.annotations[0]?.id || null;
        session.extracted = { ...session.extracted, text: session.optimizedText };
        refreshPreview(root, session);
        renderList(root, session);
        renderDetail(root, session);
        updateBar(root, session);
      });
    }
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

  if (session.extracted.format === "pdf" && session.extracted.pdfDoc) {
    await renderPdfPreview(preview, session.extracted.pdfDoc, session.annotations, {
      onSelect,
      selectedId: session.selectedId,
    });
  } else {
    renderHtmlPreview(
      preview,
      session.extracted.html,
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

function renderList(root, session) {
  const list = root.querySelector("#ann-list");
  const count = root.querySelector("#studio-count");
  if (!list) return;
  const pending = session.annotations.filter((a) => a.status === "pending").length;
  const accepted = session.annotations.filter((a) => a.status === "accepted").length;
  if (count) {
    count.textContent = `${session.annotations.length} suggestion${session.annotations.length > 1 ? "s" : ""} · ${accepted} acceptée${accepted > 1 ? "s" : ""} · ${pending} en attente`;
  }

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
          <span class="ann-meta">${escapeHtml(a.section || "")}${a.approximate ? " · zone approx." : ""}${
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
  if (s === "accepted") return "Acceptée";
  if (s === "ignored") return "Ignorée";
  return "À traiter";
}

function renderDetail(root, session) {
  const detail = root.querySelector("#ann-detail");
  if (!detail) return;
  const ann = session.annotations.find((a) => a.id === session.selectedId);
  if (!ann) {
    detail.innerHTML = `<p class="ann-empty">Sélectionnez une suggestion pour voir le détail.</p>`;
    return;
  }

  detail.innerHTML = `
    <div class="ann-detail-card severity-${ann.severity}">
      <p class="ann-where"><span>Où</span> ${
        ann.page ? `Page ${ann.page}` : "Document"
      }${ann.section ? ` · ${escapeHtml(ann.section)}` : ""}</p>
      <p class="ann-quote">« ${escapeHtml(ann.quote || "")} »</p>
      <h3>${escapeHtml(ann.title)}</h3>
      <p class="ann-problem">${escapeHtml(ann.detail || "")}</p>
      <label class="ann-suggest-label" for="ann-suggest-input">Correction proposée</label>
      <textarea id="ann-suggest-input" class="ann-suggest" rows="3">${escapeHtml(ann.suggestion || "")}</textarea>
      <div class="ann-actions">
        <button type="button" class="analyze-btn" id="btn-accept">Accepter</button>
        <button type="button" class="btn-secondary" id="btn-ignore">Ignorer</button>
        <button type="button" class="btn-ghost-text" id="btn-edit-accept">Modifier puis accepter</button>
      </div>
    </div>`;

  const input = detail.querySelector("#ann-suggest-input");

  detail.querySelector("#btn-accept")?.addEventListener("click", () => {
    session.annotations = updateAnnotation(session.annotations, ann.id, {
      status: "accepted",
      suggestion: input?.value ?? ann.suggestion,
    });
    afterDecision(root, session);
  });

  detail.querySelector("#btn-edit-accept")?.addEventListener("click", () => {
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
  // Sélectionner la prochaine pending
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
  const bar = root.querySelector("#studio-bar-count");
  if (bar) bar.textContent = `${total} suggestion${total > 1 ? "s" : ""} · ${accepted} acceptée${accepted > 1 ? "s" : ""}`;
  const gen = root.querySelector("#btn-generate");
  if (gen) gen.disabled = accepted === 0;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
