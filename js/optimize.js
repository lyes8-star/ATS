/**
 * Applique les suggestions acceptées sur le texte du CV.
 */

/**
 * @param {string} text
 * @param {object[]} annotations - with status 'accepted' and possibly edited suggestion
 * @returns {{ text: string, applied: object[] }}
 */
export function applyAll(text, annotations) {
  const accepted = (annotations || []).filter((a) => a.status === "accepted");
  if (!accepted.length) return { text, applied: [] };

  // Remplacements d'abord (du plus long offset au plus court pour éviter décalages)
  const replaces = accepted
    .filter((a) => a.applyMode === "replace" && a.textStart != null && a.textEnd != null)
    .sort((a, b) => b.textStart - a.textStart);

  let out = text;
  const applied = [];

  for (const ann of replaces) {
    const before = out.slice(0, ann.textStart);
    const after = out.slice(ann.textEnd);
    const suggestion = ann.suggestion ?? "";
    out = before + suggestion + after;
    applied.push({ id: ann.id, mode: "replace" });
  }

  // Insertions header (coordonnées) — lignes séparées, nom avant localisation
  const headers = accepted.filter((a) => a.applyMode === "insert_header");
  if (headers.length) {
    const rank = (ann) => {
      const s = String(ann.suggestion || "");
      if (/prénom|prenom|nom|name|first.?last/i.test(s) || ann.checkId === "identity_name") return 0;
      if (/email|@/i.test(s) || ann.kind === "missing_email") return 1;
      if (/téléphone|telephone|phone|06 |07 /i.test(s) || ann.kind === "missing_phone") return 2;
      if (/paris|ville|city|adresse|location|\d{5}/i.test(s) || ann.checkId === "identity_address")
        return 4;
      return 3;
    };
    const sorted = [...headers].sort((a, b) => rank(a) - rank(b));
    const lines = sorted.map((a) => String(a.suggestion || "").trim()).filter(Boolean);
    const unique = [...new Set(lines)];
    const missing = unique.filter((l) => !out.toLowerCase().includes(String(l).toLowerCase()));
    if (missing.length) {
      // Separate lines — never join with " | " (that made address steal the name slot)
      out = `${missing.join("\n")}\n${out}`;
      headers.forEach((a) => applied.push({ id: a.id, mode: "insert_header" }));
    } else {
      headers.forEach((a) => applied.push({ id: a.id, mode: "insert_header", skipped: true }));
    }
  }

  // Insert after — append near end or after quote
  const inserts = accepted
    .filter((a) => a.applyMode === "insert_after")
    .sort((a, b) => (b.textEnd || 0) - (a.textEnd || 0));

  for (const ann of inserts) {
    const suggestion = ann.suggestion || "";
    if (!suggestion) continue;
    if (out.includes(suggestion)) {
      applied.push({ id: ann.id, mode: "insert_after", skipped: true });
      continue;
    }
    // Après un re-apply de replaces, les offsets peuvent être invalides :
    // on cherche la quote, sinon on append.
    let at = -1;
    if (ann.quote && ann.quote !== "(fin du document)" && ann.quote !== "(compétences)") {
      at = out.indexOf(ann.quote);
      if (at !== -1) at += ann.quote.length;
    }
    if (at === -1) {
      out = `${out.trimEnd()}\n\n${suggestion}\n`;
    } else {
      out = out.slice(0, at) + "\n" + suggestion + out.slice(at);
    }
    applied.push({ id: ann.id, mode: "insert_after" });
  }

  return { text: out.replace(/\n{3,}/g, "\n\n").trim() + "\n", applied };
}

/**
 * Met à jour le statut / suggestion d'une annotation dans une liste (immuable).
 */
export function updateAnnotation(annotations, id, patch) {
  return (annotations || []).map((a) => (a.id === id ? { ...a, ...patch } : a));
}
