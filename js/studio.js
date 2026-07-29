/**
 * Studio CV annoté — suggestions à appliquer soi-même (sans export CV).
 */
import {
  renderPdfPreview,
  renderHtmlPreview,
  scrollPreviewToAnnotation,
  syncPreviewSelection,
  computeFitWidthScale,
  computeHtmlFitScale,
  clampScale,
  MIN_SCALE,
  MAX_SCALE,
  SCALE_STEP,
  DEFAULT_SCALE,
} from "./annotate.js";
import { updateAnnotation } from "./optimize.js";
import { attachGeometry } from "./analyzer.js";
import {
  hasProConsent,
  isProConfigured,
  proAnalyze,
} from "./pro-client.js";
import * as extractApi from "./extract.js";

/**
 * @typedef {object} StudioSession
 * @property {File} originalFile
 * @property {import('./extract.js').ExtractResult} extracted
 * @property {object} report
 * @property {object[]} annotations
 * @property {string|null} selectedId
 * @property {object|null} retestReport
 * @property {number|null} scoreBefore
 * @property {string} [jobDescription]
 */

/**
 * Monte le studio dans un conteneur.
 * @param {HTMLElement} root
 * @param {StudioSession} session
 * @param {{ onReset?: () => void }} hooks
 */
export async function mountStudio(root, session, hooks = {}) {
  const raw = (session.annotations || []).map((a) => ({
    ...a,
    status: a.status || "pending",
  }));
  // Ciblage : ne garder que les annotations avec un passage identifiable
  session.annotations = raw.filter((a) => hasUsableQuote(a));
  if (session.report) session.report.annotations = session.annotations;
  session.selectedId =
    session.annotations.find((a) => a.id === session.selectedId)?.id ||
    session.annotations[0]?.id ||
    null;
  session.scoreBefore = session.report?.total ?? null;
  session.previewOptimized = false;
  session.previewShowsWorking = false;
  if (session.previewScale == null) session.previewScale = "fit";
  session._resolvedScale = session._resolvedScale || DEFAULT_SCALE;

  root.innerHTML = studioShell(session);
  bindStudio(root, session, hooks);
  await refreshPreview(root, session);
  updateBar(root, session);
  highlightSelection(root, session);
  if (session.selectedId) {
    const preview = root.querySelector("#cv-preview");
    if (preview) scrollPreviewToAnnotation(preview, session.selectedId);
  }
}

/** Quote utilisable pour cibler dans le fichier d'origine */
function hasUsableQuote(a) {
  if (a?.kind === "cv_source") return true;
  const q = String(a.quote || "").trim();
  if (!q) return false;
  if (/^\([^)]*\)$/.test(q)) return false; // placeholders "(document)", "(début)", …
  return true;
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
  const scoredChecks = checklist.filter((c) => c.ok === true || c.ok === false);
  const checklistOk = scoredChecks.filter((c) => c.ok === true).length;
  const checklistTotal = scoredChecks.length;
  const checklistFail = scoredChecks.filter((c) => c.ok === false);
  const KO_CHIP_CAP = 4;
  const visibleKos = checklistFail.slice(0, KO_CHIP_CAP);
  const moreKos = checklistFail.length - visibleKos.length;
  const failIdsHtml = checklistFail.length
    ? `<div class="studio-checklist-kos" id="studio-checklist-kos">${visibleKos
        .map((c) => {
          const full = String(c.label || c.id || "").trim();
          const short = shortCheckLabel(full);
          return `<button type="button" class="studio-ko-id" data-check-id="${escapeHtml(
            c.id
          )}" title="${escapeHtml(full)}">${escapeHtml(short)}</button>`;
        })
        .join("")}${
        moreKos > 0
          ? `<button type="button" class="studio-ko-more" data-ko-more="1" title="${escapeHtml(
              t("studio.checklist.hint")
            )}">+${moreKos}</button>`
          : ""
      }</div>`
    : "";

  const checklistBlock = checklistTotal
    ? `<div class="studio-checklist-block">
        <button type="button" class="studio-checklist-recap" id="studio-checklist-recap" title="${escapeHtml(
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
        </button>
        ${failIdsHtml}
      </div>`
    : "";

  const src = report.cvSource || {};
  const sourceWarn =
    src.hostile && src.label
      ? `<div class="studio-source-warn" role="alert">
          <strong>${escapeHtml(t("studio.source.warnTitle"))}</strong>
          <span>${escapeHtml(
            t("studio.source.warnBody", { tool: src.label })
          )}</span>
        </div>`
      : "";

  return `
  <div class="studio studio--preview-first" id="studio">
    <div class="studio-score-strip studio-report-strip">
      <div class="studio-score-row studio-score-row--hero">
        <div class="studio-score-main">
          <p class="studio-kicker">${escapeHtml(t("studio.kicker"))}</p>
          <p class="studio-score-line">
            <strong id="studio-score-before">${total}</strong>/100
            <span class="studio-label">${escapeHtml(label)}</span>
            <span class="studio-pass-pill ${pass ? "is-ok" : "is-risk"}">${escapeHtml(passLabel)}</span>
          </p>
          <p class="studio-hint">${escapeHtml(t("studio.hint"))}</p>
        </div>
      </div>
      ${sourceWarn}
      <div class="studio-score-row studio-score-row--meta">
        <div class="studio-axes" aria-label="${escapeHtml(t("studio.axes.label"))}">
          ${axisBar("readability")}
          ${axisBar("structure")}
          ${axisBar("content")}
          ${axisBar("keywords")}
        </div>
        ${checklistBlock}
      </div>
    </div>
    <div class="studio-split studio-split--solo">
      <div class="studio-preview-col">
        <div class="cv-preview-toolbar" role="toolbar" aria-label="${escapeHtml(t("studio.zoom.label"))}">
          <button type="button" class="cv-zoom-btn" id="btn-zoom-fit" title="${escapeHtml(t("studio.zoom.fit"))}">${escapeHtml(t("studio.zoom.fit"))}</button>
          <button type="button" class="cv-zoom-btn" id="btn-zoom-out" aria-label="${escapeHtml(t("studio.zoom.out"))}">−</button>
          <span class="cv-zoom-pct" id="cv-zoom-pct" aria-live="polite">100%</span>
          <button type="button" class="cv-zoom-btn" id="btn-zoom-in" aria-label="${escapeHtml(t("studio.zoom.in"))}">+</button>
        </div>
        <div id="cv-preview" class="cv-preview" tabindex="0" aria-label="Prévisualisation du CV annoté"></div>
      </div>
    </div>
    <div class="studio-bar" role="region" aria-label="Actions">
      <p id="studio-bar-count" class="studio-bar-count"></p>
      <div class="studio-bar-actions">
        <button type="button" class="btn-secondary hidden" id="btn-pro-analyze">${escapeHtml(t("studio.actions.proAnalyze"))}</button>
      </div>
    </div>
    <div id="studio-toast" class="studio-toast hidden" role="status" aria-live="polite"></div>
    <p id="studio-jd-overlap" class="studio-jd-overlap hidden" role="status"></p>
  </div>`;
}

function focusFailedChecklist(root, session, preferredCheckId = null) {
  const checklist = session.report?.checklist || [];
  const failedIds = new Set(checklist.filter((c) => c.ok === false).map((c) => c.id));
  if (!failedIds.size && !preferredCheckId) return;
  const want = preferredCheckId && failedIds.has(preferredCheckId) ? preferredCheckId : null;
  const ann =
    (want &&
      session.annotations.find(
        (a) => a.status === "pending" && a.checkId === want
      )) ||
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
        role_keywords: "role_keywords",
        layout: a.checkId || "single_column",
        no_tables: "no_tables",
        single_column: "single_column",
        image_scan: "extractable_text",
        profile_photo: "profile_photo",
        cv_source: "cv_source",
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
  highlightSelection(root, session);
  const preview = root.querySelector("#cv-preview");
  if (preview) {
    syncPreviewSelection(preview, ann.id, session.annotations, {
      onAction: (id, action) => handleBubbleAction(root, session, id, action),
    });
    scrollPreviewToAnnotation(preview, ann.id);
  }
}

function bindStudio(root, session, hooks) {
  root.querySelector("#studio-checklist-recap")?.addEventListener("click", () => {
    focusFailedChecklist(root, session);
  });
  root.querySelector("#studio-checklist-kos")?.addEventListener("click", (e) => {
    const more = e.target.closest?.("[data-ko-more]");
    if (more) {
      focusFailedChecklist(root, session);
      return;
    }
    const btn = e.target.closest?.("[data-check-id]");
    if (!btn) return;
    focusFailedChecklist(root, session, btn.getAttribute("data-check-id"));
  });

  root.querySelector("#btn-pro-analyze")?.addEventListener("click", () => {
    runProAnalyze(root, session);
  });

  if (session.proEnabled || (hasProConsent() && isProConfigured())) {
    root.querySelector("#btn-pro-analyze")?.classList.remove("hidden");
  }

  bindZoomControls(root, session);
  showJdOverlap(root, session);
  void hooks;
}

function bindZoomControls(root, session) {
  const applyZoom = async (next) => {
    session.previewScale = next;
    await refreshPreview(root, session);
    updateZoomLabel(root, session);
    const preview = root.querySelector("#cv-preview");
    if (preview && session.selectedId) {
      scrollPreviewToAnnotation(preview, session.selectedId);
    }
  };

  root.querySelector("#btn-zoom-fit")?.addEventListener("click", () => {
    applyZoom("fit");
  });
  root.querySelector("#btn-zoom-out")?.addEventListener("click", () => {
    const cur = session._resolvedScale || DEFAULT_SCALE;
    applyZoom(clampScale(cur - SCALE_STEP));
  });
  root.querySelector("#btn-zoom-in")?.addEventListener("click", () => {
    const cur = session._resolvedScale || DEFAULT_SCALE;
    applyZoom(clampScale(cur + SCALE_STEP));
  });

  let resizeTimer = 0;
  const onResize = () => {
    if (session.previewScale !== "fit") return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      applyZoom("fit");
    }, 180);
  };
  window.addEventListener("resize", onResize);
  session._zoomResizeHandler = onResize;
}

function updateZoomLabel(root, session) {
  const el = root.querySelector("#cv-zoom-pct");
  if (!el) return;
  const pct = Math.round((session._resolvedScale || DEFAULT_SCALE) * 100);
  el.textContent = `${pct}%`;
  const fitBtn = root.querySelector("#btn-zoom-fit");
  if (fitBtn) fitBtn.classList.toggle("is-active", session.previewScale === "fit");
  const out = root.querySelector("#btn-zoom-out");
  const inn = root.querySelector("#btn-zoom-in");
  const cur = session._resolvedScale || DEFAULT_SCALE;
  if (out) out.disabled = cur <= MIN_SCALE + 0.001;
  if (inn) inn.disabled = cur >= MAX_SCALE - 0.001;
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
  try {
    showToast(root, t("studio.pro.running"));
    const text = session.extracted?.text || "";
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
    updateBar(root, session);
    await refreshPreview(root, session);
    showToast(root, data.source === "heuristic" ? t("studio.pro.heuristic") : t("studio.pro.done"));
  } catch (err) {
    console.error(err);
    showToast(root, t("studio.pro.error"));
  }
}

async function refreshPreview(root, session) {
  const preview = root.querySelector("#cv-preview");
  if (!preview) return;

  const onAction = (id, action) => handleBubbleAction(root, session, id, action);

  const onSelect = (id) => {
    session.selectedId = id;
    highlightSelection(root, session);
    syncPreviewSelection(preview, id, session.annotations, { onAction });
    scrollPreviewToAnnotation(preview, id);
  };

  const usePdf = session.extracted?.format === "pdf" && session.extracted?.pdfDoc;
  const col = root.querySelector(".studio-preview-col");
  const width = (col?.clientWidth || preview.clientWidth || 640) - 8;

  let scale;
  if (session.previewScale === "fit") {
    scale = usePdf
      ? await computeFitWidthScale(session.extracted.pdfDoc, width)
      : computeHtmlFitScale(width);
  } else {
    scale = clampScale(session.previewScale || DEFAULT_SCALE);
  }
  session._resolvedScale = scale;

  if (usePdf) {
    await renderPdfPreview(preview, session.extracted.pdfDoc, session.annotations, {
      onSelect,
      onAction,
      selectedId: session.selectedId,
      scale,
    });
  } else {
    const plain = session.extracted?.text || "";
    const html = session.extracted?.html || `<pre class="cv-txt">${escapeHtml(plain)}</pre>`;
    renderHtmlPreview(preview, html, plain, session.annotations, {
      onSelect,
      onAction,
      selectedId: session.selectedId,
      scale,
    });
  }
  updateZoomLabel(root, session);
}

function highlightSelection(root, session) {
  const preview = root.querySelector("#cv-preview");
  if (preview) {
    syncPreviewSelection(preview, session.selectedId, session.annotations, {
      onAction: (id, action) => handleBubbleAction(root, session, id, action),
    });
  }
}

async function handleBubbleAction(root, session, id, action) {
  const t = window.ATSi18n?.t || ((k) => k);
  const ann = session.annotations.find((a) => a.id === id);
  if (!ann) return;

  if (action === "copy" || action === "copy_reform") {
    const text =
      action === "copy_reform"
        ? String(ann.suggestion || "").trim()
        : String(ann.quote || "").trim();
    try {
      if (text && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("clipboard");
      }
      session.annotations = updateAnnotation(session.annotations, id, {
        status: "noted",
      });
      showToast(
        root,
        t(action === "copy_reform" ? "studio.copiedReform" : "studio.copiedPassage")
      );
      window.ATSAnalytics?.track?.("ats_passage_copied", { id, via: "bubble" });
      await afterDecision(root, session);
    } catch (err) {
      console.warn(err);
      showToast(root, t("studio.copyFailed"));
    }
    return;
  }

  if (action === "noted") {
    session.annotations = updateAnnotation(session.annotations, id, {
      status: "noted",
    });
    showToast(root, t("studio.copiedPassage"));
    await afterDecision(root, session);
    return;
  }

  if (action === "ignored") {
    session.annotations = updateAnnotation(session.annotations, id, {
      status: "ignored",
    });
    await afterDecision(root, session);
  }
}

async function afterDecision(root, session) {
  const next = session.annotations.find((a) => a.status === "pending");
  session.selectedId = next?.id || session.selectedId;
  await refreshPreview(root, session);
  updateBar(root, session);
}

function updateBar(root, session) {
  const total = session.annotations.length;
  const noted = session.annotations.filter(
    (a) => a.status === "noted" || a.status === "accepted"
  ).length;
  const pending = session.annotations.filter((a) => a.status === "pending").length;
  const t = window.ATSi18n?.t || ((k) => k);
  const bar = root.querySelector("#studio-bar-count");
  const spellN = session.report?.spelling?.length || 0;
  let label = t("studio.side.count", { total, accepted: noted, pending });
  if (spellN > 0) {
    label += ` · ${t("studio.spell.count", { n: spellN, plural: spellN > 1 ? "s" : "" })}`;
  }
  if (bar) bar.textContent = label;
}

function showToast(root, message) {
  const el = root.querySelector("#studio-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), 2200);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Libellé court pour chips checklist (max ~28 car.) */
function shortCheckLabel(label) {
  const s = String(label || "").trim();
  if (s.length <= 28) return s;
  return `${s.slice(0, 27)}…`;
}
