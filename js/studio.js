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
import { buildAiCvPrompt, promptMeta } from "./ai-prompt.js";

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

  const scoreDescKey =
    total >= 85
      ? "results.scoreDesc.high"
      : total >= 70
        ? "results.scoreDesc.good"
        : total >= 50
          ? "results.scoreDesc.mid"
          : "results.scoreDesc.low";
  const scoreMeaning = `${t("studio.score.meaning")} — ${t(scoreDescKey)}`;

  const axisBar = (key) => {
    const c = cats[key];
    if (!c) return "";
    const pct = Math.round(((c.score || 0) / (c.max || 25)) * 100);
    const axisName = t(`studio.axis.${key}`) || c.name;
    const tip = c.desc ? `${axisName}: ${c.desc}` : `${axisName}: ${c.score}/${c.max}`;
    const descLine = c.desc
      ? `<span class="studio-axis-desc">${escapeHtml(c.desc)}</span>`
      : "";
    return `<div class="studio-axis" title="${escapeHtml(tip)}">
      <div class="studio-axis-copy">
        <span class="studio-axis-name">${escapeHtml(axisName)}</span>
        ${descLine}
      </div>
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
          const short = shortCheckLabel(full, c.id);
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
          <p class="studio-score-meaning">${escapeHtml(scoreMeaning)}</p>
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
    ${matchPanelBlock(session)}
    ${aiPromptBlock(session)}
    <div class="studio-bar" role="region" aria-label="Actions">
      <p id="studio-bar-count" class="studio-bar-count"></p>
      <div class="studio-bar-actions">
        <button type="button" class="btn-secondary hidden" id="btn-pro-analyze">${escapeHtml(t("studio.actions.proAnalyze"))}</button>
      </div>
    </div>
    <div id="studio-toast" class="studio-toast hidden" role="status" aria-live="polite"></div>
  </div>`;
}

/**
 * Panneau Matching CV ↔ offre (must / nice / score) sous la preview.
 * @param {StudioSession} session
 */
function matchPanelBlock(session) {
  const t = window.ATSi18n?.t || ((k) => k);
  const jd = session.report?.jdOverlap || session.retestReport?.jdOverlap;
  const hasJdText = String(session.jobDescription || "").trim().length >= 20;
  const hasMatch = jd && (jd.score != null || (jd.mustTerms && jd.mustTerms.length));

  if (!hasJdText && !hasMatch) {
    return `
    <aside id="studio-jd-overlap" class="studio-match studio-match--empty" role="status">
      <p class="studio-match-cta">${escapeHtml(t("studio.match.empty"))}</p>
    </aside>`;
  }

  if (!hasMatch) {
    return `
    <aside id="studio-jd-overlap" class="studio-match studio-match--empty" role="status">
      <p class="studio-match-cta">${escapeHtml(t("studio.match.pending"))}</p>
    </aside>`;
  }

  const mustTerms = jd.mustTerms || [];
  const mustMissing = jd.mustMissing || [];
  const missingSet = new Set(mustMissing.map((x) => String(x).toLowerCase()));
  const mustPresent = mustTerms.filter((term) => !missingSet.has(String(term).toLowerCase()));
  const niceTerms = jd.niceTerms || [];
  const overlap = jd.overlap || [];
  const score = jd.score != null ? jd.score : "—";
  const mustCov = jd.mustCoverage != null ? jd.mustCoverage : null;
  const proScore =
    jd.proScore != null && jd.proScore !== jd.score ? jd.proScore : null;

  const chipRow = (label, terms, mod) => {
    if (!terms.length) return "";
    const chips = terms
      .slice(0, 14)
      .map(
        (term) =>
          `<span class="studio-match-chip studio-match-chip--${mod}">${escapeHtml(String(term))}</span>`
      )
      .join("");
    const more =
      terms.length > 14
        ? `<span class="studio-match-chip studio-match-chip--more">+${terms.length - 14}</span>`
        : "";
    return `<div class="studio-match-group">
      <p class="studio-match-group-label">${escapeHtml(label)}</p>
      <div class="studio-match-chips">${chips}${more}</div>
    </div>`;
  };

  return `
    <section id="studio-jd-overlap" class="studio-match" aria-labelledby="studio-match-title">
      <div class="studio-match-head">
        <div>
          <p class="studio-match-kicker">${escapeHtml(t("studio.match.kicker"))}</p>
          <h2 id="studio-match-title" class="studio-match-title">${escapeHtml(t("studio.match.title"))}</h2>
        </div>
        <div class="studio-match-scores" aria-label="${escapeHtml(t("studio.jd.overlap"))}">
          <p class="studio-match-score-main">
            <strong>${escapeHtml(String(score))}</strong><span>%</span>
            <span class="studio-match-score-caption">${escapeHtml(t("studio.match.score"))}</span>
          </p>
          ${
            proScore != null
              ? `<p class="studio-match-score-pro">${escapeHtml(
                  t("studio.match.proScore", { score: proScore })
                )}</p>`
              : ""
          }
        </div>
      </div>
      <div class="studio-match-bars">
        <div class="studio-match-bar" title="${escapeHtml(t("studio.match.score"))}">
          <span class="studio-match-bar-label">${escapeHtml(t("studio.match.score"))}</span>
          <span class="studio-match-bar-track"><span class="studio-match-bar-fill" style="width:${Math.max(0, Math.min(100, Number(score) || 0))}%"></span></span>
          <span class="studio-match-bar-val">${escapeHtml(String(score))}%</span>
        </div>
        ${
          mustCov != null
            ? `<div class="studio-match-bar" title="${escapeHtml(t("studio.match.mustCoverage"))}">
          <span class="studio-match-bar-label">${escapeHtml(t("studio.match.mustCoverage"))}</span>
          <span class="studio-match-bar-track"><span class="studio-match-bar-fill studio-match-bar-fill--must" style="width:${Math.max(0, Math.min(100, mustCov))}%"></span></span>
          <span class="studio-match-bar-val">${mustCov}%</span>
        </div>`
            : ""
        }
      </div>
      ${chipRow(t("studio.match.mustPresent"), mustPresent, "ok")}
      ${chipRow(t("studio.match.mustMissing"), mustMissing, "miss")}
      ${chipRow(t("studio.match.niceTerms"), niceTerms, "nice")}
      ${chipRow(t("studio.match.overlap"), overlap, "overlap")}
      <p class="studio-match-explain">${escapeHtml(t("studio.match.explain"))}</p>
      ${
        mustMissing.length
          ? `<p class="studio-match-prompt-note">${escapeHtml(t("studio.match.promptNote"))}</p>`
          : ""
      }
    </section>`;
}

function aiPromptLeadText(meta) {
  const t = window.ATSi18n?.t || ((k) => k);
  const vars = {
    n: meta.corrections,
    plural: meta.corrections > 1 ? "s" : "",
  };
  if (meta.hasJd) return t("studio.aiPrompt.leadJd", vars);
  return t("studio.aiPrompt.lead", vars);
}

function aiPromptBlock(session) {
  const t = window.ATSi18n?.t || ((k) => k);
  const lang = window.ATSi18n?.getLang?.() === "en" ? "en" : "fr";
  const prompt = buildAiCvPrompt(session, { lang });
  const meta = promptMeta(session);
  const lead = aiPromptLeadText(meta);
  return `
    <section class="studio-ai-prompt" aria-labelledby="studio-ai-prompt-title">
      <div class="studio-ai-prompt-head">
        <div>
          <p class="studio-ai-prompt-kicker">${escapeHtml(t("studio.aiPrompt.kicker"))}</p>
          <h2 id="studio-ai-prompt-title" class="studio-ai-prompt-title">${escapeHtml(t("studio.aiPrompt.title"))}</h2>
          <p class="studio-ai-prompt-lead">${escapeHtml(lead)}</p>
        </div>
        <button type="button" class="btn-primary" id="btn-copy-ai-prompt">${escapeHtml(t("studio.aiPrompt.copy"))}</button>
      </div>
      <label class="visually-hidden" for="studio-ai-prompt-text">${escapeHtml(t("studio.aiPrompt.title"))}</label>
      <textarea id="studio-ai-prompt-text" class="studio-ai-prompt-text" readonly rows="14" spellcheck="false">${escapeHtml(prompt)}</textarea>
      <p class="studio-ai-prompt-hint">${escapeHtml(t("studio.aiPrompt.hint"))}</p>
    </section>`;
}

function refreshAiPrompt(root, session) {
  const ta = root.querySelector("#studio-ai-prompt-text");
  const lead = root.querySelector(".studio-ai-prompt-lead");
  if (!ta) return;
  const lang = window.ATSi18n?.getLang?.() === "en" ? "en" : "fr";
  const prompt = buildAiCvPrompt(session, { lang });
  ta.value = prompt;
  if (lead) {
    lead.textContent = aiPromptLeadText(promptMeta(session));
  }
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

  root.querySelector("#btn-copy-ai-prompt")?.addEventListener("click", async () => {
    const t = window.ATSi18n?.t || ((k) => k);
    const ta = root.querySelector("#studio-ai-prompt-text");
    const text = ta?.value || buildAiCvPrompt(session, {
      lang: window.ATSi18n?.getLang?.() === "en" ? "en" : "fr",
    });
    try {
      if (text && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (ta) {
        ta.focus();
        ta.select();
        throw new Error("clipboard");
      } else {
        throw new Error("clipboard");
      }
      showToast(root, t("studio.aiPrompt.copied"));
      window.ATSAnalytics?.track?.("ats_ai_prompt_copied", {
        chars: text.length,
        corrections: promptMeta(session).corrections,
      });
    } catch (err) {
      console.warn(err);
      try {
        ta?.focus();
        ta?.select();
      } catch (_) {}
      showToast(root, t("studio.copyFailed"));
    }
  });

  if (session.proEnabled || (hasProConsent() && isProConfigured())) {
    root.querySelector("#btn-pro-analyze")?.classList.remove("hidden");
  }

  bindZoomControls(root, session);
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
    refreshAiPrompt(root, session);
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
  refreshAiPrompt(root, session);
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

/** Libellés courts pour chips checklist (par checkId, sinon troncature). */
const CHECK_CHIP_LABELS_FR = {
  email: "E-mail",
  phone: "Téléphone",
  identity_name: "Nom",
  identity_address: "Adresse",
  linkedin: "LinkedIn",
  job_title: "Intitulé",
  job_title_headline: "Titre",
  metrics: "Chiffres",
  action_verbs: "Verbes",
  weak_verbs: "Verbes",
  concision: "Longueur",
  spelling_quality: "Orthographe",
  grammar_quality: "Grammaire",
  keyword_density: "Outils",
  keyword_diversity: "Outils",
  keyword_soft_stuffing: "Outils manquants",
  role_keywords: "Métier",
  jd_overlap: "Offre",
  standard_headings: "Titres de sections",
  section_experience: "Expérience",
  section_education: "Formation",
  section_skills: "Compétences",
  no_tables: "Tableaux",
  single_column: "Colonnes",
  encoding: "Encodage",
  extractable_text: "Texte",
  page_length: "Pages",
  profile_photo: "Photo",
  cv_source: "Source",
  contact_plaintext: "Coordonnées",
  complete_role: "Poste",
  role_dates: "Dates",
  reading_order: "Ordre",
  graphic_skills: "Compétences",
};

const CHECK_CHIP_LABELS_EN = {
  email: "Email",
  phone: "Phone",
  identity_name: "Name",
  identity_address: "Location",
  linkedin: "LinkedIn",
  job_title: "Job title",
  job_title_headline: "Headline",
  metrics: "Metrics",
  action_verbs: "Verbs",
  weak_verbs: "Verbs",
  concision: "Length",
  spelling_quality: "Spelling",
  grammar_quality: "Grammar",
  keyword_density: "Tools",
  keyword_diversity: "Tools",
  keyword_soft_stuffing: "Missing tools",
  role_keywords: "Role skills",
  jd_overlap: "Job match",
  standard_headings: "Headings",
  section_experience: "Experience",
  section_education: "Education",
  section_skills: "Skills",
  no_tables: "Tables",
  single_column: "Columns",
  encoding: "Encoding",
  extractable_text: "Text",
  page_length: "Pages",
  profile_photo: "Photo",
  cv_source: "Source",
  contact_plaintext: "Contact",
  complete_role: "Role",
  role_dates: "Dates",
  reading_order: "Order",
  graphic_skills: "Skills",
};

/** Libellé court pour chips checklist (max ~28 car.) */
export function shortCheckLabel(label, checkId = "") {
  const i18n = typeof globalThis !== "undefined" ? globalThis.ATSi18n : undefined;
  const lang = i18n?.getLang?.() || "fr";
  const map = lang === "en" ? CHECK_CHIP_LABELS_EN : CHECK_CHIP_LABELS_FR;
  const id = String(checkId || "").trim();
  if (id && map[id]) return map[id];
  const s = String(label || "").trim();
  if (s.length <= 28) return s;
  return `${s.slice(0, 27)}…`;
}
