/**
 * i18n FR/EN (client-side).
 * - Conserve la page (pas de `/en/` routes)
 * - Hydrate `[data-i18n]` + support `[data-i18n-attr]`
 * - Expose `window.ATSi18n`
 */
(function () {
  const STORAGE_KEY = "ats-lang";
  const DEFAULT_LANG = "fr";

  const dict = {
    fr: {
      "hero.badge": "Analyse locale — sans compte",
      "hero.title.line1": "Votre CV est-il lisible",
      "hero.title.line2": "par un logiciel de recrutement ?",
      "hero.lead":
        "Déposez votre fichier : score sur 100, points bloquants et atelier de corrections — le fichier reste sur votre appareil.",
      "home.feature.speed.title": "Résultat rapide",
      "home.feature.speed.body": "Lecture du fichier et score en quelques secondes",
      "home.feature.score.title": "Score sur 100",
      "home.feature.score.body": "Lisibilité, structure, contenu, mots-clés",
      "home.feature.local.title": "100 % dans le navigateur",
      "home.feature.local.body": "Sans inscription pour l’analyse de base",
      "home.criteria.title": "Ce que l’atelier contrôle",
      "home.criteria.lead": "Des points concrets : texte extractible, titres de sections, coordonnées, métriques et vocabulaire métier.",
      "home.criteria.1": "Texte extractible (pas un scan illisible)",
      "home.criteria.2": "Mise en page lisible (colonnes, tableaux)",
      "home.criteria.3": "Sections Expérience, Formation, Compétences",
      "home.criteria.4": "Intitulé de poste identifiable",
      "home.criteria.5": "E-mail et téléphone en texte clair",
      "home.criteria.6": "Verbes d’action et résultats chiffrés",
      "home.criteria.7": "Outils et mots-clés métier",
      "home.criteria.8": "Longueur et clarté du contenu",
      "home.cta.title": "Prêt à contrôler votre CV ?",
      "home.cta.lead": "Sans compte. Fichier analysé localement. Rapport + correctifs à appliquer vous-même.",
      "home.cta.button": "Déposer mon CV",
      "loading.privacy": "Votre fichier reste sur votre appareil.",
      "upload.dropzone.title": "Déposez votre CV ici",
      "upload.dropzone.hint": "PDF ou DOCX — 10 Mo max · traitement dans le navigateur",
      "upload.dropzone.button": "Parcourir mes fichiers",
      "upload.email.label": "E-mail (optionnel)",
      "upload.jd.label": "Offre d'emploi (optionnel)",
      "upload.jd.placeholder": "Collez l'annonce pour mesurer l'alignement mots-clés CV ↔ offre",
      "upload.pro.consent":
        "Mode Pro (optionnel) — j’accepte l’envoi temporaire de mon CV au serveur pour suggestions LLM et ESCO. Aucune conservation longue.",
      "upload.pro.hint": "Sans Mode Pro ni Extrait, l’analyse reste 100 % locale dans votre navigateur.",
      "upload.enrich.consent":
        "Enrichissement Extrait (optionnel) — j’accepte l’envoi temporaire d’un extrait (texte / image d’en-tête) pour grammaire LanguageTool, géocodage d’adresse et classification photo. Aucune conservation longue.",
      "upload.enrich.hint":
        "L’extrait ne remplace pas le Mode Pro : pas d’IA générative.",
      "upload.analyze.button": "Lancer le contrôle",

      "header.newTest": "Autre CV",

      "loading.step.0": "Lecture du fichier…",
      "loading.step.1": "Extraction du texte…",
      "loading.step.2": "Évaluation en cours…",
      "loading.step.3": "Ouverture du rapport…",
      "loading.step.4": "Ouverture du rapport…",

      "results.subnav": "Résultat du contrôle",
      "results.subnav.reset": "Contrôle de CV",

      "results.score.label": "Score de lisibilité pour les logiciels de recrutement",
      "results.diagnostics.heading": "Diagnostic",
      "results.checklist.fail.heading": "Contrôles à corriger",
      "results.categories.heading": "Détail du score",
      "results.blockers.heading": "Points à traiter",
      "results.strengths.heading": "Points solides",
      "results.strengths.empty": "Peu de points solides détectés — renforcez structure et contenu.",
      "results.blockers.none": "Aucun point bloquant majeur détecté.",
      "results.strengths.more": "{{n}} other strengths",

      "results.pass.ok.title": "CV lisible pour les logiciels de recrutement ✓",
      "results.pass.risk.title": "Risque de mauvaise lecture automatique",
      "results.pass.fail.title": "CV difficilement exploitable automatiquement",
      "results.pass.ok.body":
        "Un bon score ne garantit pas un entretien. Affinez encore le contenu et adaptez les mots-clés à chaque offre.",
      "results.pass.risk.body":
        "Traitez d’abord les points ci-dessous pour améliorer la lecture automatique de votre CV.",

      "results.scoreDesc.high":
        "Votre CV se lit bien automatiquement. Quelques ajustements peuvent encore l’améliorer.",
      "results.scoreDesc.good":
        "Bon niveau. Traitez les points restants pour viser un score plus haut.",
      "results.scoreDesc.mid":
        "Niveau moyen — plusieurs correctifs sont utiles avant envoi.",
      "results.scoreDesc.low":
        "Score faible : le CV risque d’être mal lu ou écarté automatiquement.",

      "results.spell.ok": "Aucune faute fréquente détectée dans votre CV.",
      "results.spell.pill":
        "⚠️ {{n}} faute{{plural}} — voir le détail ↓",
      "results.spell.head":
        "🚨 {{n}} faute{{plural}} détectée{{plural}} dans votre CV",
      "results.spell.seeDetail": "voir le détail ↓",
      "results.spell.body":
        "Votre CV contient {{n}} faute{{plural}} d’orthographe. Corrigez-les avant l’envoi — elles nuisent aussi à la lecture automatique.",
      "results.back.button": "← Contrôler un autre CV",
      "results.open.studio": "Voir les corrections proposées",
      "results.open.studio.withCount": "Voir les {{n}} correction{{plural}} proposées",

      "studio.title": "Corrections proposées",
      "studio.kicker": "Corrections sur votre document",
      "studio.hint": "Zones à corriger dans votre fichier d’origine. Copiez la proposition, puis modifiez votre CV vous-même.",
      "studio.score.initial": "Score initial",
      "studio.link.report": "Voir le rapport détaillé",
      "studio.axes.label": "Détail du score",
      "studio.checklist.recap": "contrôles OK",
      "studio.checklist.fail": "à corriger",
      "studio.checklist.hint": "Voir les annotations des contrôles en échec",
      "studio.axis.readability": "Lisibilité",
      "studio.axis.structure": "Structure",
      "studio.axis.content": "Contenu",
      "studio.axis.keywords": "Mots-clés",
      "studio.pass.ok": "Lisible",
      "studio.pass.risk": "À renforcer",
      "studio.pass.fail": "Risque de rejet",
      "studio.spell.count": "{{n}} faute{{plural}} d'ortho",
      "studio.insertProposed": "Emplacement proposé (insertion)",
      "studio.zoneApprox": "Zone approximative",
      "studio.side.title": "Suggestions",
      "studio.side.count": "{{total}} zone{{plural}} · {{accepted}} notée{{plural2}} · {{pending}} en attente",
      "studio.noted": "Copiée",
      "studio.ignored": "Ignorée",
      "studio.pending": "À traiter",
      "studio.detail.where": "Où",
      "studio.detail.why": "Pourquoi sur ce passage",
      "studio.detail.correction": "Proposition de modification",
      "studio.detail.selfEdit": "Appliquez cette correction dans votre CV d’origine (Word, Canva, etc.).",
      "studio.copied": "Correction copiée — collez-la dans votre fichier.",
      "studio.copyFailed": "Impossible de copier — sélectionnez le texte manuellement.",
      "studio.detail.empty": "Sélectionnez une zone pour voir le détail.",
      "studio.actions.copySuggestion": "Copier la correction",
      "studio.actions.backReport": "Retour au rapport",
      "studio.actions.ignore": "Ignorer",
      "studio.actions.proAnalyze": "Suggestions Mode Pro",
      "studio.pro.running": "Mode Pro en cours…",
      "studio.pro.done": "Suggestions Pro ajoutées à la liste.",
      "studio.pro.error": "Mode Pro indisponible — continuez en local.",
      "studio.pro.needConsent": "Cochez le Mode Pro sur l’écran d’upload pour activer cette action.",
      "studio.jd.overlap": "Alignement offre ↔ CV",

      "chat.title": "Aide Test Mon CV",
      "chat.subtitle": "Questions fréquentes",
      "chat.fab.aria": "Ouvrir l’aide",
      "chat.faq.mail": "Écrire un e-mail",
      "chat.close": "Fermer",
      "chat.greeting": "Bonjour ! Choisissez une question ou contactez-nous.",
      "chat.header.meta": "Questions fréquentes",
      "cookie.banner.manage": "Gérer les cookies",

      "footer.madeBy": "Édité par",
      "footer.analysisLocal": "Analyse dans votre navigateur.",

      "topbar.map.show": "Afficher la carte",
      "topbar.map.open": "Ouvrir Google Maps",

      "consent.banner.aria": "Consentement cookies",
      "consent.banner.text":
        "Cookies essentiels au site et, avec votre accord, mesure d’audience / publicité. L’analyse de votre CV reste dans votre navigateur.",
      "consent.banner.learnMore": "En savoir plus",
      "consent.banner.refuse": "Refuser",
      "consent.banner.customize": "Personnaliser",
      "consent.banner.accept": "Accepter",

      "consent.modal.title": "Personnaliser les cookies",
      "consent.modal.intro":
        "Les cookies nécessaires au fonctionnement du site sont toujours actifs. Vous pouvez accepter ou refuser les catégories facultatives.",
      "consent.modal.labels.necessary": "Nécessaires",
      "consent.modal.labels.necessarySuffix": "(toujours actifs)",
      "consent.modal.labels.analytics": "Mesure d’audience (Google Analytics)",
      "consent.modal.labels.ads": "Publicité / Google Ads",
      "consent.modal.links.cookies": "Politique cookies",
      "consent.modal.links.privacy": "Confidentialité",
      "consent.modal.actions.save": "Enregistrer",
      "consent.modal.actions.acceptAll": "Tout accepter",

      "errors.formatsAccepted": "Formats acceptés : PDF ou DOCX (max 10 Mo).",
      "errors.fileTooLarge": "Fichier trop volumineux (max 10 Mo).",
      "errors.unextractable":
        "Texte non extractible — le PDF semble être un scan image. Exportez un PDF texte ou un DOCX.",

      "errors.unexpected": "Une erreur est survenue pendant l'analyse.",

      "legal.mentions.title": "Mentions légales",
      "legal.mentions.updated":
        "Conformément à la loi n°2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique (LCEN).",
      "legal.privacy.title": "Politique de confidentialité",
      "legal.privacy.updated":
        "Conformément au Règlement (UE) 2016/679 (RGPD) et à la loi Informatique et Libertés.",
      "legal.cookies.title": "Politique cookies",
      "legal.cookies.updated":
        "Conformément à la directive ePrivacy et aux recommandations de la CNIL.",
      "legal.accessibility.title": "Déclaration d’accessibilité",
      "legal.accessibility.updated":
        "Test Mon CV s’engage à rendre son site accessible conformément au RGAA 4.1, aux WCAG 2.2 niveau AA et à la directive européenne EAA (2019/882) / norme EN 301 549.",
    },
    en: {
      "hero.badge": "Local analysis — no account",
      "hero.title.line1": "Is your CV readable",
      "hero.title.line2": "by recruiting software?",
      "hero.lead":
        "Upload your file: score out of 100, blockers, and a correction studio — the file stays on your device.",
      "home.feature.speed.title": "Fast result",
      "home.feature.speed.body": "File reading and score in seconds",
      "home.feature.score.title": "Score out of 100",
      "home.feature.score.body": "Readability, structure, content, keywords",
      "home.feature.local.title": "100% in the browser",
      "home.feature.local.body": "No signup for the basic check",
      "home.criteria.title": "What the studio checks",
      "home.criteria.lead": "Concrete points: extractable text, section headings, contact details, metrics, and job vocabulary.",
      "home.criteria.1": "Extractable text (not an unreadable scan)",
      "home.criteria.2": "Readable layout (columns, tables)",
      "home.criteria.3": "Experience, Education, Skills sections",
      "home.criteria.4": "Identifiable job title",
      "home.criteria.5": "Email and phone in plain text",
      "home.criteria.6": "Action verbs and quantified results",
      "home.criteria.7": "Tools and job keywords",
      "home.criteria.8": "Length and clarity",
      "home.cta.title": "Ready to check your CV?",
      "home.cta.lead": "No account. File analyzed locally. Report + fixes for you to apply yourself.",
      "home.cta.button": "Upload my CV",
      "loading.privacy": "Your file stays on your device.",
      "upload.dropzone.title": "Drop your CV here",
      "upload.dropzone.hint": "PDF or DOCX — up to 10 MB · processed in the browser",
      "upload.dropzone.button": "Browse files",
      "upload.email.label": "Email (optional)",
      "upload.jd.label": "Job description (optional)",
      "upload.jd.placeholder": "Paste the job posting to measure CV ↔ JD keyword alignment",
      "upload.pro.consent":
        "Pro mode (optional) — I agree to temporarily send my CV to the server for LLM suggestions and ESCO matching. No long-term retention.",
      "upload.pro.hint": "Without Pro mode or Extract enrichment, analysis stays 100% local in your browser.",
      "upload.enrich.consent":
        "Extract enrichment (optional) — I agree to temporarily send an extract (text / header image) for LanguageTool grammar, address geocoding, and photo classification. No long-term retention.",
      "upload.enrich.hint":
        "Extract does not replace Pro mode: no generative AI.",
      "upload.analyze.button": "Start the check",

      "header.newTest": "Another CV",

      "loading.step.0": "Reading file…",
      "loading.step.1": "Extracting text…",
      "loading.step.2": "Evaluation in progress…",
      "loading.step.3": "Opening the report…",
      "loading.step.4": "Opening the report…",

      "results.subnav": "Check results",
      "results.subnav.reset": "CV check",

      "results.score.label": "Readability score for recruiting software",
      "results.diagnostics.heading": "Diagnostic",
      "results.checklist.fail.heading": "Checks to fix",
      "results.categories.heading": "Score breakdown",
      "results.blockers.heading": "Issues to fix",
      "results.strengths.heading": "Strong points",
      "results.strengths.empty": "Few strengths detected — work on structure and content.",
      "results.blockers.none": "No major blocking issue detected.",
      "results.strengths.more": "{{n}} other strengths",

      "results.pass.ok.title": "CV readable by recruiting software ✓",
      "results.pass.risk.title": "Risk of poor automated reading",
      "results.pass.fail.title": "CV hard to process automatically",
      "results.pass.ok.body":
        "A good score does not guarantee an interview. Keep refining content and adapt keywords to each job posting.",
      "results.pass.risk.body":
        "Address the issues below first to improve how software reads your CV.",

      "results.scoreDesc.high":
        "Your CV reads well automatically. A few tweaks can still improve it.",
      "results.scoreDesc.good":
        "Solid level. Fix remaining issues to aim higher.",
      "results.scoreDesc.mid":
        "Average level — several fixes are useful before sending.",
      "results.scoreDesc.low":
        "Low score: the CV may be misread or filtered out automatically.",

      "results.spell.ok": "No common spelling issues detected in your CV.",
      "results.spell.pill":
        "⚠️ {{n}} spelling issue{{plural}} — see details ↓",
      "results.spell.head":
        "🚨 {{n}} spelling issue{{plural}} detected{{plural}} in your CV",
      "results.spell.body":
        "Your CV contains {{n}} spelling issue{{plural}}. Fix them before sending — they also hurt automated reading.",
      "results.back.button": "← Check another CV",
      "results.open.studio": "See proposed corrections",
      "results.open.studio.withCount": "See {{n}} proposed correction{{plural}}",

      "studio.title": "Proposed corrections",
      "studio.kicker": "Edits on your document",
      "studio.hint": "Passages to fix in your original file. Copy the suggestion, then edit your CV yourself.",
      "studio.score.initial": "Initial score",
      "studio.link.report": "View detailed report",
      "studio.axes.label": "Score breakdown",
      "studio.checklist.recap": "checks OK",
      "studio.checklist.fail": "to fix",
      "studio.checklist.hint": "Jump to annotations for failed checks",
      "studio.axis.readability": "Readability",
      "studio.axis.structure": "Structure",
      "studio.axis.content": "Content",
      "studio.axis.keywords": "Keywords",
      "studio.pass.ok": "Readable",
      "studio.pass.risk": "Needs work",
      "studio.pass.fail": "Rejection risk",
      "studio.spell.count": "{{n}} spelling issue{{plural}}",
      "studio.insertProposed": "Proposed placement (insertion)",
      "studio.zoneApprox": "Approximate zone",
      "studio.side.title": "Suggestions",
      "studio.side.count": "{{total}} zone{{plural}} · {{accepted}} noted · {{pending}} pending",
      "studio.noted": "Copied",
      "studio.ignored": "Ignored",
      "studio.pending": "To review",
      "studio.detail.where": "Where",
      "studio.detail.why": "Why this passage",
      "studio.detail.correction": "Proposed change",
      "studio.detail.selfEdit": "Apply this fix in your original CV (Word, Canva, etc.).",
      "studio.copied": "Correction copied — paste it into your file.",
      "studio.copyFailed": "Could not copy — select the text manually.",
      "studio.detail.empty": "Select a zone to see the details.",
      "studio.actions.copySuggestion": "Copy correction",
      "studio.actions.backReport": "Back to report",
      "studio.actions.ignore": "Ignore",
      "studio.actions.proAnalyze": "Pro mode suggestions",
      "studio.pro.running": "Pro mode running…",
      "studio.pro.done": "Pro suggestions added to the list.",
      "studio.pro.error": "Pro mode unavailable — continue locally.",
      "studio.pro.needConsent": "Enable Pro mode on the upload screen to use this action.",
      "studio.jd.overlap": "Job ↔ CV alignment",

      "chat.title": "Test Mon CV help",
      "chat.subtitle": "Frequently asked questions",
      "chat.fab.aria": "Open help",
      "chat.faq.mail": "Send an email",
      "chat.close": "Close",
      "chat.greeting": "Hello! Choose a question or contact us.",
      "chat.header.meta": "Frequently asked questions",
      "cookie.banner.manage": "Manage cookies",

      "footer.madeBy": "Published by",
      "footer.analysisLocal": "Analysis in your browser.",

      "topbar.map.show": "Show the map",
      "topbar.map.open": "Open Google Maps",

      "consent.banner.aria": "Cookie consent",
      "consent.banner.text":
        "We use essential cookies for the website and, with your consent, audience measurement and advertising tools (Google). Your CV analysis remains local in your browser.",
      "consent.banner.learnMore": "Learn more",
      "consent.banner.refuse": "Refuse",
      "consent.banner.customize": "Customize",
      "consent.banner.accept": "Accept",

      "consent.modal.title": "Customize cookies",
      "consent.modal.intro":
        "Essential cookies needed for the site to work are always active. You can accept or refuse optional categories.",
      "consent.modal.labels.necessary": "Necessary",
      "consent.modal.labels.necessarySuffix": "(always active)",
      "consent.modal.labels.analytics": "Audience measurement (Google Analytics)",
      "consent.modal.labels.ads": "Advertising / Google Ads",
      "consent.modal.links.cookies": "Cookie policy",
      "consent.modal.links.privacy": "Privacy",
      "consent.modal.actions.save": "Save",
      "consent.modal.actions.acceptAll": "Accept all",

      "errors.formatsAccepted": "Accepted formats: PDF or DOCX (max 10 MB).",
      "errors.fileTooLarge": "File too large (max 10 MB).",
      "errors.unextractable":
        "Unable to extract text — the PDF looks like an image scan. Export a text-based PDF or a DOCX.",

      "errors.unexpected": "An error occurred while analyzing your CV.",

      "legal.mentions.title": "Legal notice",
      "legal.mentions.updated":
        "In accordance with Law No. 2004-575 of 21 June 2004 for confidence in the digital economy (LCEN).",
      "legal.privacy.title": "Privacy policy",
      "legal.privacy.updated":
        "In accordance with Regulation (EU) 2016/679 (GDPR) and the Data Protection Act (Informatique et Libertés).",
      "legal.cookies.title": "Cookies policy",
      "legal.cookies.updated":
        "In accordance with the ePrivacy Directive and CNIL recommendations.",
      "legal.accessibility.title": "Accessibility statement",
      "legal.accessibility.updated":
        "Test Mon CV is committed to making this site accessible in accordance with RGAA 4.1, WCAG 2.2 AA level, and the European Accessibility Act (2019/882) / EN 301 549 standard.",
    },
  };

  let lang = DEFAULT_LANG;

  function safePlural(n, suffix) {
    return Number(n) > 1 ? suffix : "";
  }

  function t(key, vars = {}) {
    const target = dict[lang] || dict[DEFAULT_LANG];
    let str = target[key] ?? (dict[DEFAULT_LANG] ? dict[DEFAULT_LANG][key] : undefined) ?? key;
    // very small templating {{var}}
    str = str.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (k === "plural") return safePlural(vars.n ?? vars.total ?? 0, vars.pluralSuffix ?? "s");
      if (k === "plural2") return safePlural(vars.accepted ?? 0, vars.plural2Suffix ?? "s");
      return String(vars[k] ?? "");
    });
    return str;
  }

  function setDocumentLang(next) {
    document.documentElement.lang = next;
  }

  function hydrateDataI18n(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const attr = el.getAttribute("data-i18n-attr");
      const value = t(key);
      if (attr) el.setAttribute(attr, value);
      else {
        // allow explicit HTML injection later
        const mode = el.getAttribute("data-i18n-html");
        if (mode === "1") el.innerHTML = value;
        else el.textContent = value;
      }
    });
  }

  function updateLangSwitch() {
    document.querySelectorAll("[data-lang-switch]").forEach((root) => {
      root.querySelectorAll("[data-lang-btn]").forEach((btn) => {
        const next = btn.getAttribute("data-lang-btn");
        btn.setAttribute("aria-pressed", String(next === lang));
      });
    });
  }

  function setLang(next) {
    const normalized = next === "en" ? "en" : "fr";
    lang = normalized;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (_) {}
    setDocumentLang(lang);
    hydrateDataI18n();
    updateLangSwitch();
    document.dispatchEvent(
      new CustomEvent("ats:lang-changed", { detail: { lang } })
    );
  }

  function getLang() {
    return lang;
  }

  function init() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "en" || saved === "fr") lang = saved;
    } catch (_) {}
    setDocumentLang(lang);
    hydrateDataI18n();
    updateLangSwitch();
  }

  window.ATSi18n = { t, setLang, getLang, init, dict };
  init();

  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-lang-btn]");
    if (!btn) return;
    const next = btn.getAttribute("data-lang-btn");
    if (!next) return;
    setLang(next);
  });
})();

