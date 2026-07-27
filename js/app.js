import { analyzeCv } from "./analyzer.js";

const CIRCUMFERENCE = 2 * Math.PI * 90;
const ARC = CIRCUMFERENCE * 0.75; // 270°

const els = {
  viewUpload: document.getElementById("view-upload"),
  viewResults: document.getElementById("view-results"),
  dropzone: document.getElementById("dropzone"),
  fileInput: document.getElementById("file-input"),
  fileChip: document.getElementById("file-chip"),
  fileName: document.getElementById("file-name"),
  analyzeBtn: document.getElementById("analyze-btn"),
  emailInput: document.getElementById("email-input"),
  errorBanner: document.getElementById("error-banner"),
  loading: document.getElementById("loading"),
  loadingStep: document.getElementById("loading-step"),
  resultsRoot: document.getElementById("results-root"),
  btnNewTest: document.getElementById("btn-new-test"),
  subnavTitle: document.getElementById("subnav-title"),
};

let selectedFile = null;

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
  const items = els.loading.querySelectorAll("[data-step]");
  items.forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.remove("active", "done");
    if (n < step) li.classList.add("done");
    if (n === step) li.classList.add("active");
  });
  if (els.loadingStep) {
    const labels = [
      "Lecture du fichier…",
      "Extraction du texte…",
      "Analyse ATS en cours…",
      "Génération du rapport…",
    ];
    els.loadingStep.textContent = labels[step] || labels[0];
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function extractTextFromPdf(file) {
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) throw new Error("Bibliothèque PDF non chargée.");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items.map((it) => it.str).join(" ");
    text += line + "\n";
  }
  return { text, pages: doc.numPages };
}

async function extractTextFromDocx(file) {
  if (!window.mammoth) throw new Error("Bibliothèque DOCX non chargée.");
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return { text: result.value || "", pages: null };
}

async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return extractTextFromPdf(file);
  }
  if (
    name.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return extractTextFromDocx(file);
  }
  if (name.endsWith(".txt") || file.type.startsWith("text/")) {
    return { text: await file.text(), pages: null };
  }
  throw new Error("Format non supporté. Utilisez un PDF ou un DOCX.");
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
    showError("Formats acceptés : PDF ou DOCX (max 10 Mo).");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    showError("Fichier trop volumineux (max 10 Mo).");
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

function renderResults(report) {
  const offset = ARC - (ARC * report.total) / 100;
  const visibleStrengths = report.strengths.slice(0, 7);
  const moreStrengths = Math.max(0, report.strengths.length - visibleStrengths.length);

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
    <div class="diag-item ${d.severity}">
      <div class="diag-item-title">
        <span>${severityEmoji(d.severity)}</span>
        <p>${escapeHtml(d.title)}</p>
      </div>
      <p class="diag-body">${escapeHtml(d.body)}</p>
      <p class="diag-tip">${escapeHtml(d.tip)}</p>
    </div>`
    )
    .join("");

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
    spellHtml = `
      <div id="spell-check" class="spell-box">
        <div class="spell-head">
          <h2>🚨 ${report.spelling.length} faute${report.spelling.length > 1 ? "s" : ""} détectée${report.spelling.length > 1 ? "s" : ""} dans votre CV</h2>
          <p>Votre CV contient ${report.spelling.length} faute${report.spelling.length > 1 ? "s" : ""} d'orthographe. Un CV avec des fautes envoie un signal négatif aux recruteurs — avant même que l'ATS ne le lise.</p>
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
    spellHtml = `<div class="ok-spell">${icon("check")} Aucune faute fréquente détectée dans votre CV.</div>`;
  }

  const passClass = report.passes ? "" : report.total >= 50 ? "warn" : "fail";
  const passTitle = report.passes
    ? "Votre CV passe les filtres ATS ✓"
    : report.total >= 50
      ? "Votre CV risque d'être filtré"
      : "Votre CV est mal optimisé pour les ATS";
  const passBody = report.passes
    ? "Un bon score ATS ne suffit pas pour décrocher un entretien. Affinez encore vos points faibles et adaptez les mots-clés à chaque offre."
    : "Corrigez d'abord les points bloquants ci-dessous pour maximiser vos chances de passer les robots de recrutement.";

  const scoreDesc =
    report.total >= 85
      ? "Votre CV est bien optimisé pour les ATS. Quelques ajustements peuvent encore l'améliorer."
      : report.total >= 70
        ? "Bon niveau de compatibilité. Traitez les points bloquants pour viser l'excellence."
        : report.total >= 50
          ? "Compatibilité moyenne — plusieurs correctifs sont nécessaires avant envoi."
          : "Score faible : le CV risque d'être rejeté automatiquement par de nombreux ATS.";

  els.resultsRoot.innerHTML = `
    <div class="card score-card">
      <p class="score-label">Votre score de compatibilité ATS</p>
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
          ? `<a href="#spell-check"><div class="spell-pill">⚠️ ${report.spelling.length} faute${report.spelling.length > 1 ? "s" : ""} d'orthographe — voir le détail ↓</div></a>`
          : ""
      }
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
        <p>🔍 Diagnostic de votre CV</p>
        <div class="diag-tags">${tags}</div>
      </div>
      ${diagItems}
    </div>

    <div>
      <h2 class="section-title">Détail par catégorie</h2>
      <div class="cat-grid">${cats}</div>
    </div>

    <div>
      <h2 class="section-title" style="color:var(--terra)">${icon("alert")} Points bloquants (${report.blockers.length})</h2>
      <div class="blockers-list">
        ${report.blockers.length ? `<ul>${blockers}</ul>` : "<p style='margin:0;font-size:0.875rem;color:#57534e'>Aucun point bloquant majeur détecté.</p>"}
      </div>
    </div>

    <div>
      <h2 class="section-title">${icon("check")} Ce qui fonctionne bien</h2>
      <div class="strengths-grid">${strengths || "<p>Peu de points forts détectés — travaillez la structure et le contenu.</p>"}</div>
      ${
        moreStrengths
          ? `<div class="blockers-list"><ul><li>+ ${moreStrengths} autres points forts</li></ul></div>`
          : ""
      }
    </div>

    ${spellHtml}

    <div class="text-center">
      <button type="button" class="link-back" id="btn-another">← Tester un autre CV</button>
    </div>
  `;

  requestAnimationFrame(() => {
    const arc = document.getElementById("gauge-arc");
    if (arc) arc.setAttribute("stroke-dashoffset", String(offset));
  });

  document.getElementById("btn-another")?.addEventListener("click", resetToUpload);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showResults() {
  els.viewUpload.classList.add("hidden");
  els.viewResults.classList.remove("hidden");
  els.subnavTitle.textContent = "Résultat de votre analyse ATS";
  els.btnNewTest.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetToUpload() {
  selectedFile = null;
  els.fileInput.value = "";
  els.fileChip.classList.add("hidden");
  els.analyzeBtn.disabled = true;
  els.viewResults.classList.add("hidden");
  els.viewUpload.classList.remove("hidden");
  els.subnavTitle.textContent = "Vérificateur ATS gratuit";
  els.btnNewTest.classList.add("hidden");
  clearError();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function runAnalysis() {
  if (!selectedFile) return;
  clearError();
  try {
    setLoading(true, 0);
    await wait(300);
    setLoading(true, 1);
    const extracted = await extractText(selectedFile);
    await wait(250);
    setLoading(true, 2);
    await wait(400);
    const report = analyzeCv(extracted.text, {
      fileName: selectedFile.name,
      pages: extracted.pages,
      fileType: selectedFile.type,
    });
    setLoading(true, 3);
    await wait(350);
    renderResults(report);
    setLoading(false);
    showResults();
  } catch (err) {
    setLoading(false);
    console.error(err);
    showError(err.message || "Une erreur est survenue pendant l'analyse.");
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

document.querySelectorAll("[data-scroll-top]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
  });
});
