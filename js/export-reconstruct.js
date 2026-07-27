/**
 * Reconstruction HTML/DOCX — thème ATS Clean (même pipeline que export-cv).
 * DOCX in-place reste prioritaire pour les sources DOCX.
 */
import {
  buildCleanHtml,
  buildCvModel,
  downloadCleanHtml,
  openCleanPrintable,
  parseCvSections,
} from "./export-cv.js";

export { buildCleanHtml as buildFaithfulHtml, parseCvSections };

/**
 * @deprecated alias — uses clean layout (no branding)
 */
export function buildFaithfulHtmlLegacy(optimizedText, parsed, meta = {}) {
  return buildCleanHtml(optimizedText, parsed, meta);
}

export function downloadFaithfulHtml(optimizedText, parsed, meta = {}) {
  return downloadCleanHtml(optimizedText, parsed, meta);
}

export function openFaithfulPrintable(optimizedText, parsed, meta = {}) {
  return openCleanPrintable(optimizedText, parsed, meta);
}

/**
 * DOCX reconstruit via lib `docx` (CDN), thème propre 1 colonne.
 */
export async function downloadReconstructedDocx(optimizedText, parsed, meta = {}) {
  await ensureDocxLib();
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
  const model = buildCvModel(optimizedText, parsed, meta);
  const children = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: model.name, bold: true, size: 36, font: "Calibri" })],
      spacing: { after: 60 },
    })
  );
  if (model.title) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: model.title, size: 22, font: "Calibri" })],
        spacing: { after: 40 },
      })
    );
  }
  if (model.contactLine) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: model.contactLine, size: 18, font: "Calibri", color: "57534E" })],
        spacing: { after: 160 },
        border: { bottom: { color: "1C1917", space: 4, style: "single", size: 12 } },
      })
    );
  }

  for (const key of model.order) {
    if (key === "summary" && model.summaryLines.length) {
      children.push(heading(model.titles.summary, HeadingLevel));
      for (const line of model.summaryLines) {
        children.push(bodyPara(line));
      }
    } else if (key === "experience" && model.roles.length) {
      children.push(heading(model.titles.experience, HeadingLevel));
      for (const role of model.roles) {
        const head = [role.title, role.company].filter(Boolean).join(" — ");
        const years = formatYearsLocal(role);
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: head, bold: true, size: 20, font: "Calibri" }),
              ...(years
                ? [new TextRun({ text: `  ${years}`, size: 17, font: "Calibri", color: "57534E" })]
                : []),
            ],
            spacing: { before: 80, after: 40 },
          })
        );
        for (const b of role.bullets || []) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: b, size: 19, font: "Calibri" })],
              bullet: { level: 0 },
              spacing: { after: 20 },
            })
          );
        }
      }
    } else if (key === "education" && model.education.length) {
      children.push(heading(model.titles.education, HeadingLevel));
      for (const edu of model.education) {
        const head = [edu.title, edu.company].filter(Boolean).join(" — ");
        const years = formatYearsLocal(edu);
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: head, bold: true, size: 19, font: "Calibri" }),
              ...(years
                ? [new TextRun({ text: `  ${years}`, size: 17, color: "57534E", font: "Calibri" })]
                : []),
            ],
            spacing: { after: 40 },
          })
        );
      }
    } else if (key === "skills" && model.skills.length) {
      children.push(heading(model.titles.skills, HeadingLevel));
      children.push(bodyPara(model.skills.join(" · ")));
    } else if (key === "languages" && model.languages.length) {
      children.push(heading(model.titles.languages, HeadingLevel));
      children.push(bodyPara(model.languages.join(" · ")));
    } else if (key === "other" && model.other.length) {
      children.push(heading(model.titles.other, HeadingLevel));
      for (const line of model.other) children.push(bodyPara(line));
    }
  }

  void AlignmentType;
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 560, bottom: 560, left: 680, right: 680 },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base = String(meta.fileName || "cv").replace(/\.[^.]+$/, "");
  a.href = url;
  a.download = `${base}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob;
}

function heading(text, HeadingLevel) {
  const { Paragraph, TextRun } = window.docx;
  return new Paragraph({
    children: [
      new TextRun({
        text: String(text || "").toUpperCase(),
        bold: true,
        size: 18,
        font: "Calibri",
        allCaps: true,
      }),
    ],
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 60 },
    border: { bottom: { color: "D6D3D1", space: 1, style: "single", size: 6 } },
  });
}

function bodyPara(text) {
  const { Paragraph, TextRun } = window.docx;
  return new Paragraph({
    children: [new TextRun({ text, size: 19, font: "Calibri" })],
    spacing: { after: 40 },
  });
}

function formatYearsLocal(role) {
  if (!role.startYear && !role.endYear) return "";
  const end = role.ongoing ? "Présent" : role.endYear || "";
  if (role.startYear && end) return `${role.startYear} – ${end}`;
  return String(role.startYear || end);
}

let docxLoading = null;
function ensureDocxLib() {
  if (window.docx?.Document) return Promise.resolve();
  if (docxLoading) return docxLoading;
  docxLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Impossible de charger la lib docx"));
    document.head.appendChild(s);
  });
  return docxLoading;
}

/**
 * Export principal layout-fidèle / propre selon le format source.
 * @param {object} session
 * @param {object} [meta]
 */
export async function downloadLayoutFaithful(session, meta = {}) {
  const format = session.extracted?.format;
  const opts = {
    fileName: meta.fileName || session.originalFile?.name,
    lang: meta.lang || window.ATSi18n?.getLang?.() || "fr",
    parsed: session.report?.parsed,
    layoutHostile: session.report?.layoutHostile,
  };
  if (format === "docx") {
    const { downloadOptimizedDocx } = await import("./export-docx.js");
    return downloadOptimizedDocx(session, opts);
  }
  downloadCleanHtml(session.optimizedText, session.report?.parsed, opts);
  try {
    await downloadReconstructedDocx(session.optimizedText, session.report?.parsed, opts);
  } catch (err) {
    console.warn("DOCX reconstruct skipped", err);
  }
  return { usedFallback: false };
}
