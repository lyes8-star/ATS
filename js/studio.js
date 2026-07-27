/**
 * Studio CV annoté — suggestions à appliquer soi-même (sans export CV).
 */
import {
  renderPdfPreview,
  renderHtmlPreview,
  scrollPreviewToAnnotation,
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
  session.annotations = (session.annotations || []).map((a) => ({
    ...a,
    status: a.status || "pending",
  }));
  session.selectedId = session.selectedId || session.annotations[0]?.id || null;
  session.scoreBefore = session.report?.total ?? null;
  session.previewOptimized = false;
  session.previewShowsWorking = false;

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
  const failIdsHtml = checklistFail.length
    ? `<div class="studio-checklist-kos" id="studio-checklist-kos">${checklistFail
        .map(
          (c) =>
            `<button type="button" class="studio-ko-id" data-check-id="${escapeHtml(
              c.id
            )}" title="${escapeHtml(c.label)}">${escapeHtml(c.id)}</button>`
        )
        .join("")}</div>`
    : "";

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
        </button>${failIdsHtml}`
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
    <div class="studio-bar" role="region" aria-label="Actions">
      <p id="studio-bar-count" class="studio-bar-count"></p>
      <div class="studio-bar-actions">
        <button type="button" class="btn-secondary" id="btn-back-report">${escapeHtml(t("studio.actions.backReport"))}</button>
        <button type="button" class="btn-secondary hidden" id="btn-pro-analyze">${escapeHtml(t("studio.actions.proAnalyze"))}</button>
      </div>
    </div>
    <div id="studio-toast" class="studio-toast hidden" role="status" aria-live="polite"></div>
    <p id="studio-jd-overlap" class="studio-jd-overlap hidden" role="status"></p>
  </div>`;
}

function focusFailedChecklist(root, session, preferredCheckId = null) {
  const checklist = session.report?.checklist || [];
  const failedIds = new Set(checklist.filter((c) => !c.ok).map((c) => c.id));
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
  root.querySelector("#studio-checklist-kos")?.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-check-id]");
    if (!btn) return;
    focusFailedChecklist(root, session, btn.getAttribute("data-check-id"));
  });

  root.querySelector("#btn-back-report")?.addEventListener("click", () => {
    // Return to detailed report without destroying session
    const upload = document.getElementById("view-upload");
    const results = document.getElementById("view-results");
    const studio = document.getElementById("view-studio");
    studio?.classList.add("hidden");
    upload?.classList.add("hidden");
    results?.classList.remove("hidden");
    const sub = document.getElementById("subnav-title");
    if (sub) {
      sub.textContent =
        window.ATSi18n?.t?.("results.subnav") || "Résultat du contrôle";
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.ATSAnalytics?.track?.("ats_studio_back_report");
  });

  root.querySelector("#btn-pro-analyze")?.addEventListener("click", () => {
    runProAnalyze(root, session);
  });

  if (session.proEnabled || (hasProConsent() && isProConfigured())) {
    root.querySelector("#btn-pro-analyze")?.classList.remove("hidden");
  }

  showJdOverlap(root, session);
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
    renderList(root, session);
    renderDetail(root, session);
    updateBar(root, session);
    showToast(root, t("studio.pro.done"));
  } catch (err) {
    console.error(err);
    showToast(root, t("studio.pro.error"));
  }
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

  const usePdf = session.extracted?.format === "pdf" && session.extracted?.pdfDoc;

  if (usePdf) {
    await renderPdfPreview(preview, session.extracted.pdfDoc, session.annotations, {
      onSelect,
      selectedId: session.selectedId,
    });
  } else {
    const plain = session.extracted?.text || "";
    const html = session.extracted?.html || `<pre class="cv-txt">${escapeHtml(plain)}</pre>`;
    renderHtmlPreview(preview, html, plain, session.annotations, {
      onSelect,
      selectedId: session.selectedId,
    });
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
  const noted = session.annotations.filter(
    (a) => a.status === "noted" || a.status === "accepted"
  ).length;
  const spellN = session.report?.spelling?.length || 0;
  const countText = t("studio.side.count", {
    total: session.annotations.length,
    accepted: noted,
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
  if (s === "noted" || s === "accepted") return t("studio.noted");
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
      <p class="ann-self-edit">${escapeHtml(t("studio.detail.selfEdit"))}</p>
      <label class="ann-suggest-label" for="ann-suggest-input">${escapeHtml(t("studio.detail.correction"))}</label>
      <textarea id="ann-suggest-input" class="ann-suggest" rows="3">${escapeHtml(ann.suggestion || "")}</textarea>
      <div class="ann-actions">
        <button type="button" class="analyze-btn" id="btn-copy">${escapeHtml(t("studio.actions.copySuggestion"))}</button>
        <button type="button" class="btn-secondary" id="btn-ignore">${escapeHtml(t("studio.actions.ignore"))}</button>
      </div>
    </div>`;

  const input = detail.querySelector("#ann-suggest-input");

  detail.querySelector("#btn-copy")?.addEventListener("click", async () => {
    const suggestion = (input?.value ?? ann.suggestion ?? "").trim();
    try {
      if (suggestion && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(suggestion);
      } else if (suggestion && input) {
        input.focus();
        input.select();
        document.execCommand("copy");
      }
      session.annotations = updateAnnotation(session.annotations, ann.id, {
        status: "noted",
        suggestion,
      });
      showToast(root, t("studio.copied"));
      window.ATSAnalytics?.track?.("ats_suggestion_copied", { id: ann.id });
      afterDecision(root, session);
    } catch (err) {
      console.warn(err);
      showToast(root, t("studio.copyFailed"));
    }
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
  const noted = session.annotations.filter(
    (a) => a.status === "noted" || a.status === "accepted"
  ).length;
  const pending = session.annotations.filter((a) => a.status === "pending").length;
  const t = window.ATSi18n?.t || ((k) => k);
  const bar = root.querySelector("#studio-bar-count");
  const count = root.querySelector("#studio-count");
  const label = t("studio.side.count", { total, accepted: noted, pending });
  if (bar) bar.textContent = label;
  if (count) count.textContent = label;
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
