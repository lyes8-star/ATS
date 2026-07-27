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
import { downloadAtsHtml } from "./export-cv.js";
import { downloadLayoutFaithful, openFaithfulPrintable } from "./export-reconstruct.js";
import { analyzeCvAsync, attachGeometry } from "./analyzer.js";
import {
  hasProConsent,
  isProConfigured,
  proAnalyze,
  proPdfPatch,
  arrayBufferToBase64,
  downloadBlob,
} from "./pro-client.js";
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
 * @property {boolean} [previewOptimized]
 * @property {string} [jobDescription]
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
  const report = session.report || {};
  const total = report.total ?? "—";
  const label = report.label?.text ?? "";
  const pass = report.passes;
  const cats = report.categories || {};
  const pending = (session.annotations || []).filter((a) => a.status === "pending").length;
  const spellN = report.spelling?.length || 0;
  void pending;
  void spellN;
  const passLabel = pass
    ? t("studio.pass.ok")
    : total >= 50
      ? t("studio.pass.risk")
      : t("studio.pass.fail");

  const axisBar = (key) => {
    const c = cats[key];
    if (!c) return "";
    const pct = Math.round(((c.score || 0) / (c.max || 25)) * 100);
    return `<div class="studio-axis" title="${escapeHtml(c.name)}: ${c.score}/${c.max}">
      <span class="studio-axis-name">${escapeHtml(c.name)}</span>
      <span class="studio-axis-track"><span class="studio-axis-fill ${escapeHtml(c.bar || "bg-amber")}" style="width:${pct}%"></span></span>
      <span class="studio-axis-score">${c.score}/${c.max}</span>
    </div>`;
  };

  const checklist = report.checklist || [];
  const checklistOk = checklist.filter((c) => c.ok).length;
  const checklistTotal = checklist.length;
  const checklistFail = checklist.filter((c) => !c.ok);

  return `
  <div class="studio" id="studio">
    <div class="studio-score-strip studio-report-strip">
      <div class="studio-score-main">
        <p class="studio-kicker">${escapeHtml(t("studio.kicker"))}</p>
        <p class="studio-score-line">
          <strong id="studio-score-before">${total}</strong>/100
          <span class="studio-label">${escapeHtml(label)}</span>
          <span class="studio-pass-pill ${pass ? "is-ok" : "is-risk"}">${escapeHtml(passLabel)}</span>
        </p>
        ${
          checklistTotal
            ? `<button type="button" class="studio-checklist-recap" id="studio-checklist-recap" title="${escapeHtml(
                t("studio.checklist.hint")
              )}">
          <span class="studio-checklist-score">${checklistOk}/${checklistTotal}</span>
          ${escapeHtml(t("studio.checklist.recap"))}
          ${
            checklistFail.length
              ? `<span class="studio-checklist-fail">${checklistFail.length} ${escapeHtml(
                  t("studio.checklist.fail")
                )}</span>`
              : ""
          }
        </button>`
            : ""
        }
        <p id="studio-count" class="studio-count-inline"></p>
      </div>
      <div class="studio-axes" aria-label="${escapeHtml(t("studio.axes.label"))}">
        ${axisBar("readability")}
        ${axisBar("structure")}
        ${axisBar("content")}
        ${axisBar("keywords")}
      </div>
      <div class="studio-score-actions">
        <p class="studio-hint">${escapeHtml(t("studio.hint"))}</p>
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
        <button type="button" class="analyze-btn hidden" id="btn-download">${escapeHtml(t("studio.actions.download"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-download-ats">${escapeHtml(t("studio.actions.downloadAts"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-print">${escapeHtml(t("studio.actions.print"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-pro-analyze">${escapeHtml(t("studio.actions.proAnalyze"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-pro-pdf">${escapeHtml(t("studio.actions.proPdf"))}</button>
        <button type="button" class="analyze-btn hidden" id="btn-retest">${escapeHtml(t("studio.actions.retest"))}</button>
      </div>
    </div>
    <div id="retest-banner" class="retest-banner hidden" role="status"></div>
    <p id="studio-jd-overlap" class="studio-jd-overlap hidden" role="status"></p>
  </div>`;
}

function focusFailedChecklist(root, session) {
  const checklist = session.report?.checklist || [];
  const failedIds = new Set(checklist.filter((c) => !c.ok).map((c) => c.id));
  if (!failedIds.size) return;
  const ann =
    session.annotations.find(
      (a) => a.status === "pending" && a.checkId && failedIds.has(a.checkId)
    ) ||
    session.annotations.find((a) => {
      if (a.status !== "pending") return false;
      // Map common kinds to checklist ids
      const map = {
        missing_email: "email",
        missing_phone: "phone",
        missing_linkedin: "linkedin",
        missing_name: "identity_name",
        incomplete_role: "complete_role",
        graphic_skills: "graphic_skills",
        reading_order: "reading_order",
        header_sparse: "contact_plaintext",
        layout: a.checkId || "single_column",
        missing_section:
          /expérience|experience/i.test(a.title || "")
            ? "section_experience"
            : /formation|education/i.test(a.title || "")
              ? "section_education"
              : "section_skills",
        gap: "employment_gap",
        missing_metric: "metrics",
        length: "page_length",
      };
      const id = typeof map[a.kind] === "string" ? map[a.kind] : map[a.kind];
      return id && failedIds.has(id);
    }) ||
    session.annotations.find((a) => a.status === "pending");
  if (!ann) return;
  session.selectedId = ann.id;
  renderList(root, session);
  renderDetail(root, session);
  highlightSelection(root, session);
  const preview = root.querySelector("#cv-preview");
  if (preview) scrollPreviewToAnnotation(preview, ann.id);
  root.querySelector(`.ann-item[data-id="${ann.id}"]`)?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
  root.querySelector("#ann-list")?.focus?.();
}

function bindStudio(root, session, hooks) {
  root.querySelector("#studio-checklist-recap")?.addEventListener("click", () => {
    focusFailedChecklist(root, session);
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
    root.querySelector("#btn-download-ats")?.classList.remove("hidden");
    root.querySelector("#btn-print")?.classList.remove("hidden");
    root.querySelector("#btn-retest")?.classList.remove("hidden");
    if (session.proEnabled || (hasProConsent() && isProConfigured())) {
      root.querySelector("#btn-pro-analyze")?.classList.remove("hidden");
      if (session.extracted?.format === "pdf" || session.extracted?.originalBuffer) {
        root.querySelector("#btn-pro-pdf")?.classList.remove("hidden");
      }
    }
    window.ATSAnalytics?.track?.("ats_cv_generated", {
      accepted: session.annotations.filter((a) => a.status === "accepted").length,
    });
    runRetest(root, session, hooks);
  });

  root.querySelector("#btn-pro-analyze")?.addEventListener("click", () => {
    runProAnalyze(root, session);
  });

  root.querySelector("#btn-pro-pdf")?.addEventListener("click", () => {
    runProPdf(session);
  });

  root.querySelector("#btn-download")?.addEventListener("click", () => {
    if (!session.optimizedText) return;
    downloadPrimary(session);
  });

  root.querySelector("#btn-download-ats")?.addEventListener("click", () => {
    if (!session.optimizedText) return;
    downloadAtsHtml(session.optimizedText, {
      fileName: session.originalFile?.name,
      lang: window.ATSi18n?.getLang?.() || "fr",
      parsed: session.report?.parsed,
    });
  });

  root.querySelector("#btn-print")?.addEventListener("click", () => {
    if (!session.optimizedText) return;
    printPrimary(session);
  });

  root.querySelector("#btn-retest")?.addEventListener("click", () => {
    if (!session.optimizedText) {
      const { text } = applyAll(session.extracted.text, session.annotations);
      session.optimizedText = text;
    }
    runRetest(root, session, hooks);
  });

  showJdOverlap(root, session);
}

function downloadPrimary(session) {
  const meta = {
    fileName: session.originalFile?.name,
    lang: window.ATSi18n?.getLang?.() || "fr",
    parsed: session.report?.parsed,
  };
  downloadLayoutFaithful(session, meta).catch((err) => {
    console.error(err);
    downloadAtsHtml(session.optimizedText, meta);
  });
}

function printPrimary(session) {
  const meta = {
    fileName: session.originalFile?.name,
    lang: window.ATSi18n?.getLang?.() || "fr",
    layoutHostile: session.report?.layoutHostile,
    parsed: session.report?.parsed,
  };
  openFaithfulPrintable(session.optimizedText, session.report?.parsed, meta);
}

function showJdOverlap(root, session) {
  const el = root.querySelector("#studio-jd-overlap");
  if (!el) return;
  const jd = session.report?.jdOverlap || session.retestReport?.jdOverlap;
  if (jd && jd.score != null) {
    el.classList.remove("hidden");
    const t = window.ATSi18n?.t || ((k) => k);
    el.textContent = `${t("studio.jd.overlap")}: ${jd.score}% (${(jd.overlap || []).length})`;
  }
}

async function runProAnalyze(root, session) {
  const t = window.ATSi18n?.t || ((k) => k);
  if (!hasProConsent() || !isProConfigured()) {
    alert(t("studio.pro.needConsent"));
    return;
  }
  const banner = root.querySelector("#retest-banner");
  try {
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<p>${escapeHtml(t("studio.pro.running"))}</p>`;
    }
    const text = session.optimizedText || session.extracted?.text || "";
    const data = await proAnalyze({
      text,
      jobDescription: session.jobDescription || "",
      lang: window.ATSi18n?.getLang?.() || "fr",
    });
    const anns = (data.annotations || []).map((a) => ({
      ...a,
      status: a.status || "pending",
    }));
    const geo = attachGeometry(anns, session.extracted?.pagesGeo || [], extractApi);
    session.annotations = [...(session.annotations || []), ...geo];
    session.selectedId = session.annotations.find((a) => a.status === "pending")?.id || session.selectedId;
    renderList(root, session);
    renderDetail(root, session);
    updateBar(root, session);
    if (banner) {
      banner.innerHTML = `<p role="status">${escapeHtml(t("studio.pro.done"))}</p>`;
    }
  } catch (err) {
    console.error(err);
    if (banner) {
      banner.classList.remove("hidden");
      banner.innerHTML = `<p role="alert">${escapeHtml(t("studio.pro.error"))}</p>`;
    }
  }
}

async function runProPdf(session) {
  const t = window.ATSi18n?.t || ((k) => k);
  if (!hasProConsent() || !isProConfigured()) {
    alert(t("studio.pro.needConsent"));
    return;
  }
  try {
    const buf = session.extracted?.originalBuffer;
    const optimizedText = session.optimizedText || session.extracted?.text || "";
    const blob = await proPdfPatch({
      pdfBase64: buf ? arrayBufferToBase64(buf) : "",
      optimizedText,
      lang: window.ATSi18n?.getLang?.() || "fr",
      fileName: session.originalFile?.name || "cv.pdf",
    });
    const base = String(session.originalFile?.name || "cv").replace(/\.[^.]+$/, "");
    downloadBlob(blob, `${base}.pdf`);
  } catch (err) {
    console.error(err);
    alert(t("studio.pro.error"));
  }
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

async function runRetest(root, session, hooks) {
  try {
    const t = window.ATSi18n?.t || ((k) => k);
    const report = await analyzeCvAsync(
      session.optimizedText,
      {
        fileName: session.originalFile?.name || "cv-optimise",
        pages: estimatePagesFromText(session.optimizedText),
        lang: window.ATSi18n?.getLang?.() || "fr",
        pagesGeo: session.extracted?.pagesGeo,
        tableCount: session.extracted?.tableCount || 0,
        tableHint: session.extracted?.tableHint,
        headerSparse: session.extracted?.headerSparse,
        readingOrderOk: session.extracted?.readingOrderOk,
      },
      { jobDescription: session.jobDescription || "" }
    );
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
                   <button type="button" class="btn-secondary" id="btn-retest-ats">${escapeHtml(
                     t("studio.actions.downloadAts")
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
        downloadPrimary(session);
      });
      banner.querySelector("#btn-retest-ats")?.addEventListener("click", () => {
        downloadAtsHtml(session.optimizedText, {
          fileName: session.originalFile?.name,
          lang: window.ATSi18n?.getLang?.() || "fr",
          parsed: session.report?.parsed || report.parsed,
        });
      });
      banner.querySelector("#btn-retest-print")?.addEventListener("click", () => {
        printPrimary(session);
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
          format: session.extracted?.format === "docx" ? "docx" : "html",
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
        showJdOverlap(root, session);
      });
    }
    root.querySelector("#btn-download")?.classList.remove("hidden");
    root.querySelector("#btn-download-ats")?.classList.remove("hidden");
    root.querySelector("#btn-print")?.classList.remove("hidden");
    showJdOverlap(root, session);
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
  const spellN = session.report?.spelling?.length || 0;
  const countText = t("studio.side.count", {
    total: session.annotations.length,
    accepted,
    pending,
  });
  const stripExtra =
    spellN > 0
      ? ` · ${t("studio.spell.count", { n: spellN, plural: spellN > 1 ? "s" : "" })}`
      : "";
  if (count) count.textContent = countText + stripExtra;
  if (barCount) barCount.textContent = countText;

  const axisOrder = ["readability", "structure", "content", "keywords"];
  const axisLabel = {
    readability: t("studio.axis.readability"),
    structure: t("studio.axis.structure"),
    content: t("studio.axis.content"),
    keywords: t("studio.axis.keywords"),
  };
  const byAxis = new Map();
  for (const a of session.annotations) {
    const key = a.axis || "content";
    if (!byAxis.has(key)) byAxis.set(key, []);
    byAxis.get(key).push(a);
  }

  const blocks = [];
  for (const axis of axisOrder) {
    const items = byAxis.get(axis);
    if (!items?.length) continue;
    blocks.push(`<p class="ann-axis-head">${escapeHtml(axisLabel[axis] || axis)}</p>`);
    for (const a of items) {
      const num = a.id.replace("ann-", "");
      const short = a.shortLabel || "";
      blocks.push(`
      <button type="button" class="ann-item severity-${a.severity} status-${a.status}${
        a.id === session.selectedId ? " is-selected" : ""
      }" data-id="${a.id}" role="option" aria-selected="${a.id === session.selectedId}">
        <span class="ann-num" title="${escapeHtml(short)}">${escapeHtml(num)}</span>
        <span class="ann-item-body">
          <strong>${escapeHtml(a.title)}</strong>
          <span class="ann-meta">${escapeHtml(short)}${short ? " · " : ""}${escapeHtml(
            a.section || ""
          )}${placementMeta(a, t)}${a.page ? ` · p.${a.page}` : ""}</span>
        </span>
        <span class="ann-status-pill">${statusLabel(a.status)}</span>
      </button>`);
    }
  }
  // Orphans
  for (const [axis, items] of byAxis) {
    if (axisOrder.includes(axis)) continue;
    for (const a of items) {
      const num = a.id.replace("ann-", "");
      blocks.push(`
      <button type="button" class="ann-item severity-${a.severity} status-${a.status}${
        a.id === session.selectedId ? " is-selected" : ""
      }" data-id="${a.id}" role="option">
        <span class="ann-num">${escapeHtml(num)}</span>
        <span class="ann-item-body"><strong>${escapeHtml(a.title)}</strong></span>
        <span class="ann-status-pill">${statusLabel(a.status)}</span>
      </button>`);
    }
  }

  list.innerHTML = blocks.join("");

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
      }${ann.section ? ` · ${escapeHtml(ann.section)}` : ""}${
        ann.shortLabel ? ` · ${escapeHtml(ann.shortLabel)}` : ""
      }</p>
      ${placementNote}
      <p class="ann-quote">« ${escapeHtml(ann.quote || "")} »</p>
      <h3>${escapeHtml(ann.title)}</h3>
      <p class="ann-why-label">${escapeHtml(t("studio.detail.why"))}</p>
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
