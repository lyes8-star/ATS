import { analyzeCvAsync, attachGeometry, mergeRemoteEnrichment } from "./analyzer.js";
import { extractDocument, revokeExtractObjectUrl } from "./extract.js";
import * as extractApi from "./extract.js";
import { mountStudio } from "./studio.js";
import {
  hasProConsent,
  setProConsent,
  hasEnrichConsent,
  setEnrichConsent,
  canCallEnrich,
  isProConfigured,
  proAnalyze,
  proSkills,
  enrichGrammar,
  enrichGeocode,
  enrichPhoto,
} from "./pro-client.js";

const CIRCUMFERENCE = 2 * Math.PI * 90;
const ARC = CIRCUMFERENCE * 0.75;

const els = {
  viewUpload: document.getElementById("view-upload"),
  viewResults: document.getElementById("view-results"),
  viewStudio: document.getElementById("view-studio"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileChip: document.getElementById("file-chip"),
  fileName: document.getElementById("file-name"),
  analyzeBtn: document.getElementById("analyze-btn"),
  emailInput: document.getElementById("email-input"),
  jdInput: document.getElementById("jd-input"),
  proConsent: document.getElementById("pro-consent"),
  enrichConsent: document.getElementById("enrich-consent"),
  errorBanner: document.getElementById("error-banner"),
  loading: document.getElementById("loading"),
  loadingStep: document.getElementById("loading-step"),
  resultsRoot: document.getElementById("results-root"),
  studioRoot: document.getElementById("studio-root"),
  btnNewTest: document.getElementById("btn-new-test"),
  subnavTitle: document.getElementById("subnav-title"),
};

let selectedFile = null;
/** @type {import('./studio.js').StudioSession|null} */
let session = null;

function showError(msg) {
  els.errorBanner.textContent = msg;
  els.errorBanner.classList.remove("hidden");
}

function clearError() {
  els.errorBanner.classList.add("hidden");
  els.errorBanner.textContent = "";
}

function setLoading(on, step = 0) {
  els.loading.classList.toggle("hidden", !on);
  els.loading.setAttribute("aria-busy", on ? "true" : "false");
  document.body.style.overflow = on ? "hidden" : "";
  const items = els.loading.querySelectorAll("[data-step]");
  items.forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.remove("active", "done");
    if (n < step) li.classList.add("done");
    if (n === step) li.classList.add("active");
  });
  if (els.loadingStep) {
    const t = window.ATSi18n?.t;
    if (t) {
      els.loadingStep.textContent = t(`loading.step.${step}`) || t("loading.step.0");
    } else {
      const labels = [
        "Lecture du fichier…",
        "Extraction du texte…",
        "Analyse ATS en cours…",
        "Ouverture de l'analyse…",
      ];
      els.loadingStep.textContent = labels[step] || labels[0];
    }
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function acceptFile(file) {
  clearError();
  if (!file) return;
  const ok =
    /\.(pdf|docx|txt)$/i.test(file.name) ||
    file.type === "application/pdf" ||
    file.type.includes("wordprocessingml") ||
    file.type.startsWith("text/");
  if (!ok) {
    showError(window.ATSi18n?.t?.("errors.formatsAccepted") || "Formats acceptés : PDF ou DOCX (max 10 Mo).");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError(window.ATSi18n?.t?.("errors.fileTooLarge") || "Fichier trop volumineux (max 10 Mo).");
    return;
  }
  selectedFile = file;
  els.fileName.textContent = file.name;
  els.fileChip.classList.remove("hidden");
  els.analyzeBtn.disabled = false;
}

function icon(name) {
  const icons = {
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    monitor: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
    layout: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="7" x="3" y="3" rx="1"/><rect width="9" height="7" x="3" y="14" rx="1"/><rect width="5" height="7" x="16" y="14" rx="1"/></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
    tag: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
    alert: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };
  return icons[name] || "";
}

function severityEmoji(s) {
  if (s === "critical") return "🔴";
  if (s === "warning") return "🟠";
  return "🟡";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResults(report) {
  const offset = ARC - (ARC * report.total) / 100;
  const visibleStrengths = report.strengths.slice(0, 7);
  const moreStrengths = Math.max(0, report.strengths.length - visibleStrengths.length);
  const t = window.ATSi18n?.t || ((k) => k);

  const cats = Object.values(report.categories)
    .map((c, i) => {
      const iconsList = ["monitor", "layout", "file", "tag"];
      const pct = Math.round((c.score / c.max) * 100);
      return `
      <div class="cat-card">
        <div class="cat-top">
          <div class="cat-name">
            <div class="cat-icon">${icon(iconsList[i])}</div>
            <span>${c.name}</span>
          </div>
          <span class="cat-score ${c.color}">${c.score}<small>/${c.max}</small></span>
        </div>
        <div class="bar"><div class="${c.bar}" style="width:${pct}%"></div></div>
        <p class="cat-desc">${c.desc}</p>
      </div>`;
    })
    .join("");

  const diagItems = report.diagnostics
    .map(
      (d) => `
    <div class="diag-item ${d.severity}"${d.checkId ? ` data-check-id="${escapeHtml(d.checkId)}"` : ""}>
      <div class="diag-item-title">
        <span>${severityEmoji(d.severity)}</span>
        <p>${escapeHtml(d.title)}${
          d.checkId
            ? ` <code class="diag-check-id">${escapeHtml(d.checkId)}</code>`
            : ""
        }</p>
      </div>
      <p class="diag-body">${escapeHtml(d.body)}</p>
      <p class="diag-tip">${escapeHtml(d.tip)}</p>
    </div>`
    )
    .join("");

  const failedChecks = (report.checklist || []).filter((c) => c.ok === false);
  const failedChecklistHtml = failedChecks.length
    ? `<div class="failed-checklist">
        <h2 class="section-title">${t("results.checklist.fail.heading")} (${failedChecks.length})</h2>
        <ul class="failed-checklist-list">
          ${failedChecks
            .map(
              (c) =>
                `<li data-check-id="${escapeHtml(c.id)}"><code>${escapeHtml(
                  c.id
                )}</code> — ${escapeHtml(c.label)}</li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";

  const tags = report.tags
    .map((t) => `<span class="diag-tag">${escapeHtml(t)}</span>`)
    .join("");

  const strengths = visibleStrengths
    .map(
      (s) => `
    <div class="strength">
      ${icon("check")}
      <div><strong>${escapeHtml(s.category)} — </strong><span>${escapeHtml(s.label)}</span></div>
    </div>`
    )
    .join("");

  const blockers = report.blockers
    .map((b) => `<li><strong>${escapeHtml(b.category)}</strong> — ${escapeHtml(b.label)}</li>`)
    .join("");

  let spellHtml = "";
  if (report.spelling.length > 0) {
    const n = report.spelling.length;
    spellHtml = `
      <div id="spell-check" class="spell-box">
        <div class="spell-head">
          <h2>${t("results.spell.head", { n })}</h2>
          <p>${t("results.spell.body", { n })}</p>
        </div>
        <div class="spell-list">
          ${report.spelling
            .map(
              (s) => `
            <div class="spell-item">
              <span class="spell-wrong">${escapeHtml(s.wrong)}</span>
              <span>→</span>
              <span class="spell-right">${escapeHtml(s.right)}</span>
              <span class="spell-ctx">${escapeHtml(s.context)}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
  } else {
    spellHtml = `<div class="ok-spell">${icon("check")} ${t("results.spell.ok")}</div>`;
  }

  const passClass = report.passes ? "" : report.total >= 50 ? "warn" : "fail";
  const passTitle = report.passes
    ? t("results.pass.ok.title")
    : report.total >= 50
      ? t("results.pass.risk.title")
      : t("results.pass.fail.title");
  const passBody = report.passes ? t("results.pass.ok.body") : t("results.pass.risk.body");

  const scoreDesc =
    report.total >= 85
      ? t("results.scoreDesc.high")
      : report.total >= 70
        ? t("results.scoreDesc.good")
        : report.total >= 50
          ? t("results.scoreDesc.mid")
          : t("results.scoreDesc.low");

  const annCount = report.annotations?.length || 0;

  els.resultsRoot.innerHTML = `
    <div class="card score-card">
      <p class="score-label">${t("results.score.label")}</p>
      <div class="gauge" aria-label="Score ${report.total} sur 100">
        <svg width="200" height="200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="#EDE0CF" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${ARC} ${CIRCUMFERENCE}"></circle>
          <circle id="gauge-arc" cx="100" cy="100" r="90" fill="none" stroke="${report.label.stroke}" stroke-width="14" stroke-linecap="round"
            stroke-dasharray="${ARC} ${CIRCUMFERENCE}" stroke-dashoffset="${ARC}"
            style="transition: stroke-dashoffset 1s ease;"></circle>
        </svg>
        <div class="gauge-center">
          <span class="gauge-score ${report.label.color}">${report.total}</span>
          <span class="gauge-max">/100</span>
          <span class="gauge-label ${report.label.color}">${report.label.text}</span>
        </div>
      </div>
      <p class="score-desc">${scoreDesc}</p>
      ${
        report.spelling.length
          ? `<a href="#spell-check"><div class="spell-pill">${t("results.spell.pill", { n: report.spelling.length })}</div></a>`
          : ""
      }
      <button type="button" class="analyze-btn studio-cta" id="btn-open-studio">
        ${t("results.open.studio.withCount", { n: annCount })}
      </button>
    </div>

    <div class="pass-banner ${passClass}">
      <div class="pass-icon">${icon("check")}</div>
      <div>
        <h3 style="color:${report.passes ? "#166534" : report.total >= 50 ? "#9a3412" : "#991b1b"}">${passTitle}</h3>
        <p style="color:${report.passes ? "#15803d" : report.total >= 50 ? "#9a3412" : "#991b1b"}">${passBody}</p>
      </div>
    </div>

    <div class="diag">
      <div class="diag-head">
        <p>🔍 ${t("results.diagnostics.heading")}</p>
        <div class="diag-tags">${tags}</div>
      </div>
      ${diagItems}
    </div>

    ${failedChecklistHtml}

    <div>
      <h2 class="section-title">${t("results.categories.heading")}</h2>
      <div class="cat-grid">${cats}</div>
    </div>

    <div>
      <h2 class="section-title" style="color:var(--terra)">${icon("alert")} ${t("results.blockers.heading")} (${report.blockers.length})</h2>
      <div class="blockers-list">
        ${
          report.blockers.length
            ? `<ul>${blockers}</ul>`
            : `<p style='margin:0;font-size:0.875rem;color:#57534e'>${t("results.blockers.none")}</p>`
        }
      </div>
    </div>

    <div>
      <h2 class="section-title">${icon("check")} ${t("results.strengths.heading")}</h2>
      <div class="strengths-grid">${strengths || `<p>${t("results.strengths.empty")}</p>`}</div>
      ${
        moreStrengths
          ? `<div class="blockers-list"><ul><li>+ ${t("results.strengths.more", {
              n: moreStrengths,
            })}</li></ul></div>`
          : ""
      }
    </div>

    ${spellHtml}

    <div class="text-center">
      <button type="button" class="link-back" id="btn-another">${t("results.back.button")}</button>
    </div>
  `;

  requestAnimationFrame(() => {
    const arc = document.getElementById("gauge-arc");
    if (arc) arc.setAttribute("stroke-dashoffset", String(offset));
  });

  document.getElementById("btn-another")?.addEventListener("click", resetToUpload);
  document.getElementById("btn-open-studio")?.addEventListener("click", openStudio);
}

function showResults() {
  // Legacy — parcours principal = vue unifiée uniquement
  void openUnifiedView();
}

async function openUnifiedView() {
  if (!session || !els.studioRoot) return;
  els.viewResults?.classList.add("hidden");
  els.viewUpload.classList.add("hidden");
  els.viewStudio.classList.remove("hidden");
  if (els.subnavTitle) {
    els.subnavTitle.textContent =
      window.ATSi18n?.t?.("studio.title") || "Corrections proposées";
  }
  els.btnNewTest.classList.remove("hidden");
  await mountStudio(els.studioRoot, session, { onReset: resetToUpload });
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.ATSAnalytics?.track?.("ats_studio_open", {
    annotations: session.annotations.length,
  });
}

/** @deprecated use openUnifiedView */
async function openStudio() {
  return openUnifiedView();
}

function resetToUpload() {
  revokeExtractObjectUrl(session?.extracted);
  selectedFile = null;
  session = null;
  els.fileInput.value = "";
  els.fileChip.classList.add("hidden");
  els.analyzeBtn.disabled = true;
  els.viewResults?.classList.add("hidden");
  els.viewStudio?.classList.add("hidden");
  els.viewUpload.classList.remove("hidden");
  if (els.studioRoot) els.studioRoot.innerHTML = "";
  if (els.subnavTitle) {
    els.subnavTitle.textContent =
      window.ATSi18n?.t?.("results.subnav.reset") || "Contrôle de CV";
  }
  els.btnNewTest.classList.add("hidden");
  clearError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function runAnalysis() {
  if (!selectedFile) return;
  clearError();
  try {
    // Drop previous Blob URL before a new extraction
    revokeExtractObjectUrl(session?.extracted);
    setLoading(true, 0);
    await wait(300);
    setLoading(true, 1);
    const extracted = await extractDocument(selectedFile);
    if (
      extracted.format === "pdf" &&
      (extracted.approximate || (extracted.imageOnlyPages || []).length > 0) &&
      extracted.text.replace(/\s/g, "").length < 40
    ) {
      throw new Error(
        window.ATSi18n?.t?.("errors.unextractable") ||
          "Texte non extractible — le PDF semble être un scan image. Exportez un PDF texte ou un DOCX (pas une photo)."
      );
    }
    await wait(250);
    setLoading(true, 2);
    await wait(400);
    const report = await analyzeCvAsync(
      extracted.text,
      {
        fileName: selectedFile.name,
        pages: extracted.pages,
        fileType: selectedFile.type,
        format: extracted.format,
        lang: window.ATSi18n?.getLang?.() || "fr",
        pagesGeo: extracted.pagesGeo,
        tableCount: extracted.tableCount || 0,
        tableHint: extracted.tableHint,
        headerSparse: extracted.headerSparse,
        readingOrderOk: extracted.readingOrderOk,
        profilePhotoHint: extracted.profilePhotoHint,
        imageOnlyPages: extracted.imageOnlyPages || [],
        pdfCreator: extracted.pdfCreator || null,
        pdfProducer: extracted.pdfProducer || null,
        approximate: extracted.approximate,
      },
      { jobDescription: els.jdInput?.value || "" }
    );
    // Même string pour annotations, géométrie et applyAll
    extracted.text = report.text;
    const annotations = attachGeometry(
      report.annotations || [],
      extracted.pagesGeo,
      extractApi
    );
    report.annotations = annotations;

    session = {
      originalFile: selectedFile,
      extracted,
      report,
      annotations,
      selectedId: annotations[0]?.id || null,
      optimizedText: null,
      retestReport: null,
      scoreBefore: report.total,
      jobDescription: els.jdInput?.value || "",
      proEnabled: hasProConsent() && isProConfigured(),
      enrichEnabled: canCallEnrich(),
    };

    // Enrichissement Extrait (ou Pro) — grammar / geocode / photo
    if (session.enrichEnabled) {
      try {
        setLoading(true, 2);
        const lang = window.ATSi18n?.getLang?.() || "fr";
        const contact = report.parsed?.contact || {};
        const preview = extracted.profileImagePreview;
        const [grammar, geo, photo] = await Promise.all([
          enrichGrammar({ text: extracted.text, lang }).catch(() => null),
          contact.address || contact.location
            ? enrichGeocode({ address: contact.address, location: contact.location }).catch(() => null)
            : Promise.resolve(null),
          preview?.base64
            ? enrichPhoto({ imageBase64: preview.base64, mime: preview.mime }).catch(() => null)
            : Promise.resolve(null),
        ]);
        mergeRemoteEnrichment(
          report,
          { grammar: grammar || undefined, geo: geo || undefined, photo: photo || undefined },
          { lang }
        );
        const geoAnns = attachGeometry(report.annotations || [], extracted.pagesGeo, extractApi);
        report.annotations = geoAnns;
        session.annotations = geoAnns;
        session.report = report;
        session.selectedId = geoAnns[0]?.id || null;
        window.ATSAnalytics?.track?.("ats_enrich_enabled", {
          grammar: grammar?.issues?.length || 0,
          geo: !!geo?.ok,
          photo: photo?.kind || null,
        });
      } catch (enrichErr) {
        console.warn("Enrichissement Extrait skipped", enrichErr);
      }
    }

    // Mode Pro enrichissement (opt-in) — annotations LLM + overlap ESCO
    if (session.proEnabled) {
      try {
        setLoading(true, 2);
        const [proAnns, proSk] = await Promise.all([
          proAnalyze({
            text: extracted.text,
            jobDescription: session.jobDescription,
            lang: window.ATSi18n?.getLang?.() || "fr",
          }).catch(() => null),
          session.jobDescription
            ? proSkills({
                text: extracted.text,
                jobDescription: session.jobDescription,
                lang: window.ATSi18n?.getLang?.() || "fr",
              }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (proAnns?.annotations?.length) {
          const isHeuristic =
            proAnns.source === "heuristic" ||
            proAnns.annotations.some(
              (a) => a.source === "pro-heuristic" || a.source === "heuristic"
            );
          const lang = window.ATSi18n?.getLang?.() || "fr";
          const prepared = isHeuristic
            ? proAnns.annotations.map((a) => ({
                ...a,
                severity: "info",
                shortLabel: lang === "en" ? "Fallback" : "Secours",
                source: a.source || "pro-heuristic",
                proFallback: true,
              }))
            : proAnns.annotations;
          const geo = attachGeometry(prepared, extracted.pagesGeo, extractApi);
          session.annotations = [...session.annotations, ...geo];
          report.annotations = session.annotations;
          session.selectedId = session.annotations[0]?.id || null;
        }
        if (proSk && proSk.score != null) {
          const local = report.jdOverlap || {};
          report.jdOverlap = {
            ...local,
            // Keep local must* / coverage; Pro score is secondary only
            mustTerms: local.mustTerms || [],
            mustMissing: local.mustMissing || [],
            mustCoverage: local.mustCoverage != null ? local.mustCoverage : null,
            niceTerms: local.niceTerms || [],
            jdTerms: local.jdTerms || [],
            overlap: local.overlap?.length ? local.overlap : proSk.overlap || local.overlap || [],
            score: local.score != null ? local.score : proSk.score,
            proScore: proSk.score,
          };
          session.report = report;
        }
        window.ATSAnalytics?.track?.("ats_pro_enabled", { anns: proAnns?.annotations?.length || 0 });
      } catch (proErr) {
        console.warn("Mode Pro skipped", proErr);
      }
    }

    window.ATSAnalytics?.track?.("ats_analysis_complete", {
      score: report.total,
      passes: report.passes,
      annotations: annotations.length,
    });
    setLoading(true, 3);
    await wait(350);
    // Vue unique : score + CV annoté (plus de bascule rapport / studio)
    setLoading(false);
    await openUnifiedView();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showError(
      err.message ||
        window.ATSi18n?.t?.("errors.unexpected") ||
        "Une erreur est survenue pendant l'analyse."
    );
  }
}

/* Events */
els.dropzone.addEventListener("click", () => els.fileInput.click());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});
els.dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  els.dropzone.classList.add("dragover");
});
els.dropzone.addEventListener("dragleave", () => {
  els.dropzone.classList.remove("dragover");
});
els.dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  els.dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files?.[0];
  acceptFile(file);
});
els.fileInput.addEventListener("change", () => {
  acceptFile(els.fileInput.files?.[0]);
});
els.analyzeBtn.addEventListener("click", runAnalysis);
els.btnNewTest.addEventListener("click", resetToUpload);

// Logo (et texte de marque) = retour à l'accueil (vue upload), jamais une navigation externe.
document.querySelectorAll("a.logo").forEach((a) => {
  a.addEventListener("click", (e) => {
    // L'UX attendue est un "reset" de l'application (SPA), pas un chargement d'un autre site.
    e.preventDefault();
    resetToUpload();
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

if (els.proConsent) {
  els.proConsent.checked = hasProConsent();
  els.proConsent.addEventListener("change", () => {
    setProConsent(els.proConsent.checked);
    if (els.proConsent.checked && els.enrichConsent) {
      els.enrichConsent.checked = true;
      setEnrichConsent(true);
    }
  });
}

if (els.enrichConsent) {
  els.enrichConsent.checked = hasEnrichConsent();
  els.enrichConsent.addEventListener("change", () => {
    setEnrichConsent(els.enrichConsent.checked);
  });
}

document.querySelectorAll("[data-scroll-top]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
  });
});
