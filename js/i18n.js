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
      "hero.badge": "Analyse gratuite — Résultat immédiat",
      "hero.title.line1": "Votre CV passe-t-il",
      "hero.title.line2": "les filtres ATS ?",
      "hero.lead":
        "85 % des CV sont éliminés avant d'atteindre un recruteur. Obtenez votre score ATS en quelques secondes et découvrez comment corriger vos points faibles.",
      "upload.dropzone.title": "Déposez votre CV ou cliquez pour choisir",
      "upload.dropzone.hint": "PDF ou DOCX — max 10 Mo · analyse 100 % locale",
      "upload.dropzone.button": "Choisir mon CV",
      "upload.email.label": "E-mail (optionnel)",
      "upload.jd.label": "Offre d'emploi (optionnel)",
      "upload.jd.placeholder": "Collez l'annonce pour mesurer l'alignement mots-clés CV ↔ offre",
      "upload.pro.consent":
        "Mode Pro (optionnel) — j’accepte l’envoi temporaire de mon CV au serveur pour suggestions LLM, ESCO et PDF avancé. Aucune conservation longue.",
      "upload.pro.hint": "Sans Mode Pro, l’analyse reste 100 % locale dans votre navigateur.",
      "upload.analyze.button": "Analyser mon CV",

      "header.newTest": "Nouveau test",

      "loading.step.0": "Lecture du fichier…",
      "loading.step.1": "Extraction du texte…",
      "loading.step.2": "Analyse ATS en cours…",
      "loading.step.3": "Génération du rapport…",
      "loading.step.4": "Ouverture de l'atelier…",

      "results.subnav": "Résultat de votre analyse ATS",
      "results.subnav.reset": "Vérificateur ATS gratuit",

      "results.score.label": "Votre score de compatibilité ATS",
      "results.diagnostics.heading": "Diagnostic de votre CV",
      "results.categories.heading": "Détail par catégorie",
      "results.blockers.heading": "Points bloquants",
      "results.strengths.heading": "Ce qui fonctionne bien",
      "results.strengths.empty": "Few strengths detected — work on structure and content.",
      "results.blockers.none": "No major blocking issue detected.",
      "results.strengths.more": "{{n}} other strengths",

      "results.pass.ok.title": "Votre CV passe les filtres ATS ✓",
      "results.pass.risk.title": "Votre CV risque d'être filtré",
      "results.pass.fail.title": "Votre CV est mal optimisé pour les ATS",
      "results.pass.ok.body":
        "Un bon score ATS ne suffit pas pour décrocher un entretien. Affinez encore vos points faibles et adaptez les mots-clés à chaque offre.",
      "results.pass.risk.body":
        "Corrigez d'abord les points bloquants ci-dessous pour maximiser vos chances de passer les robots de recrutement.",

      "results.scoreDesc.high":
        "Votre CV est bien optimisé pour les ATS. Quelques ajustements peuvent encore l'améliorer.",
      "results.scoreDesc.good":
        "Bon niveau de compatibilité. Traitez les points bloquants pour viser l'excellence.",
      "results.scoreDesc.mid":
        "Compatibilité moyenne — plusieurs correctifs sont nécessaires avant envoi.",
      "results.scoreDesc.low":
        "Score faible : le CV risque d'être rejeté automatiquement par de nombreux ATS.",

      "results.spell.ok": "Aucune faute fréquente détectée dans votre CV.",
      "results.spell.pill":
        "⚠️ {{n}} faute{{plural}} — voir le détail ↓",
      "results.spell.head":
        "🚨 {{n}} faute{{plural}} détectée{{plural}} dans votre CV",
      "results.spell.seeDetail": "voir le détail ↓",
      "results.spell.body":
        "Votre CV contient {{n}} faute{{plural}} d'orthographe. Un CV avec des fautes envoie un signal négatif aux recruteurs — avant même que l'ATS ne le lise.",
      "results.back.button": "← Tester un autre CV",
      "results.open.studio": "Ouvrir l'atelier annoté",
      "results.open.studio.withCount": "Ouvrir l'atelier annoté ({{n}} suggestion{{plural}})",

      "studio.title": "Atelier CV annoté",
      "studio.kicker": "Atelier d'optimisation ATS",
      "studio.hint": "Cliquez une zone colorée ou une suggestion pour corriger précisément.",
      "studio.score.initial": "Score initial",
      "studio.retest.pass": "Le CV optimisé passe mieux les filtres ATS.",
      "studio.retest.continue": "Continuez l'optimisation pour viser 70+.",
      "studio.retest.continueButton": "Continuer l'optimisation",
      "studio.retest.ready": "CV prêt à envoyer — téléchargez votre version (mise en page préservée) ou la version ATS linéaire.",
      "studio.link.report": "Voir le rapport détaillé",
      "studio.acceptAll": "Accepter tout (remplacements sûrs)",
      "studio.insertProposed": "Emplacement proposé (insertion)",
      "studio.zoneApprox": "Zone approximative",
      "studio.side.title": "Suggestions",
      "studio.side.count": "{{total}} suggestion{{plural}} · {{accepted}} acceptée{{plural2}} · {{pending}} en attente",
      "studio.generate.button": "Générer mon CV ATS optimisé",
      "studio.accepted": "Acceptée",
      "studio.ignored": "Ignorée",
      "studio.pending": "À traiter",
      "studio.detail.where": "Où",
      "studio.detail.correction": "Correction proposée",
      "studio.detail.empty": "Sélectionnez une suggestion pour voir le détail.",
      "studio.actions.accept": "Accepter",
      "studio.actions.ignore": "Ignorer",
      "studio.actions.editAccept": "Modifier puis accepter",

      "studio.actions.download": "Télécharger le CV modifié",
      "studio.actions.downloadAts": "Version ATS linéaire",
      "studio.actions.print": "Imprimer / PDF",
      "studio.actions.retest": "Retester",
      "studio.actions.proAnalyze": "Suggestions Mode Pro",
      "studio.actions.proPdf": "Télécharger PDF Pro",
      "studio.pro.running": "Mode Pro en cours…",
      "studio.pro.done": "Suggestions Pro ajoutées à la liste.",
      "studio.pro.error": "Mode Pro indisponible — continuez en local.",
      "studio.pro.needConsent": "Cochez le Mode Pro sur l’écran d’upload pour activer cette action.",
      "studio.jd.overlap": "Alignement offre ↔ CV",

      "chat.title": "Assistant ATS",
      "chat.subtitle": "Questions fréquentes sur le vérificateur",
      "chat.fab.aria": "Ouvrir l’assistant ATS",
      "chat.faq.mail": "Écrire un e-mail",
      "chat.close": "Fermer",
      "chat.greeting": "Bonjour ! Choisissez une question ou contactez-nous.",
      "chat.header.meta": "Questions fréquentes sur le vérificateur",
      "cookie.banner.manage": "Gérer les cookies",

      "footer.madeBy": "Fait par",
      "footer.analysisLocal": "Analyse locale dans votre navigateur.",

      "topbar.map.show": "Afficher la carte",
      "topbar.map.open": "Ouvrir Google Maps",

      "consent.banner.aria": "Consentement cookies",
      "consent.banner.text":
        "Nous utilisons des cookies essentiels au site et, avec votre accord, des outils de mesure d’audience et de publicité (Google). L’analyse de votre CV reste locale dans votre navigateur.",
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
        "ATS Check s’engage à rendre son site accessible conformément au RGAA 4.1, aux WCAG 2.2 niveau AA et à la directive européenne EAA (2019/882) / norme EN 301 549.",
    },
    en: {
      "hero.badge": "Free analysis — Instant result",
      "hero.title.line1": "Does your CV pass",
      "hero.title.line2": "ATS filters?",
      "hero.lead":
        "85% of CVs are screened out before reaching a recruiter. Get your ATS score in seconds and learn how to fix your weak spots.",
      "upload.dropzone.title": "Drop your CV or click to choose",
      "upload.dropzone.hint": "PDF or DOCX — up to 10 MB · 100% local analysis",
      "upload.dropzone.button": "Choose my CV",
      "upload.email.label": "Email (optional)",
      "upload.jd.label": "Job description (optional)",
      "upload.jd.placeholder": "Paste the job posting to measure CV ↔ JD keyword alignment",
      "upload.pro.consent":
        "Pro mode (optional) — I agree to temporarily send my CV to the server for LLM suggestions, ESCO matching, and advanced PDF. No long-term retention.",
      "upload.pro.hint": "Without Pro mode, analysis stays 100% local in your browser.",
      "upload.analyze.button": "Analyze my CV",

      "header.newTest": "New test",

      "loading.step.0": "Reading file…",
      "loading.step.1": "Extracting text…",
      "loading.step.2": "Running ATS analysis…",
      "loading.step.3": "Building report…",
      "loading.step.4": "Opening studio…",

      "results.subnav": "Your ATS analysis result",
      "results.subnav.reset": "Free ATS CV checker",

      "results.score.label": "Your ATS compatibility score",
      "results.diagnostics.heading": "ATS diagnostic for your CV",
      "results.categories.heading": "Category breakdown",
      "results.blockers.heading": "Blocking issues",
      "results.strengths.heading": "What works well",
      "results.strengths.empty": "Few strengths detected — work on structure and content.",
      "results.blockers.none": "No major blocking issue detected.",
      "results.strengths.more": "{{n}} other strengths",

      "results.pass.ok.title": "Your CV passes ATS filters ✓",
      "results.pass.risk.title": "Your CV may be filtered out",
      "results.pass.fail.title": "Your CV is not well optimized for ATS",
      "results.pass.ok.body":
        "A good ATS score is not enough to get an interview. Refine your weak spots and tailor keywords to each job posting.",
      "results.pass.risk.body":
        "Start by fixing the blocking issues below to maximize your chances of passing ATS screening.",

      "results.spell.ok": "No common spelling issues detected in your CV.",
      "results.spell.pill":
        "⚠️ {{n}} spelling issue{{plural}} — see details ↓",
      "results.spell.head":
        "🚨 {{n}} spelling issue{{plural}} detected{{plural}} in your CV",
      "results.spell.body":
        "Your CV contains {{n}} spelling issue{{plural}}. Errors send a negative signal to recruiters — even before the ATS reads it.",
      "results.back.button": "← Test another CV",
      "results.open.studio": "Back to annotated studio",
      "results.open.studio.withCount": "Back to annotated studio ({{n}} suggestion{{plural}})",

      "studio.title": "Annotated CV studio",
      "studio.kicker": "ATS optimization studio",
      "studio.hint": "Click a highlighted area or a suggestion to correct it precisely.",
      "studio.score.initial": "Initial score",
      "studio.retest.pass": "The optimized CV passes ATS filters better.",
      "studio.retest.continue": "Continue optimizing to aim for 70+.",
      "studio.retest.continueButton": "Continue optimizing",
      "studio.retest.ready": "CV ready to send — download your layout-preserving version or the linear ATS version.",
      "studio.link.report": "View detailed report",
      "studio.acceptAll": "Accept all (safe replacements)",
      "studio.insertProposed": "Proposed placement (insertion)",
      "studio.zoneApprox": "Approximate zone",
      "studio.side.title": "Suggestions",
      "studio.side.count": "{{total}} suggestion{{plural}} · {{accepted}} accepted · {{pending}} pending",
      "studio.generate.button": "Generate my optimized ATS CV",
      "studio.accepted": "Accepted",
      "studio.ignored": "Ignored",
      "studio.pending": "To review",
      "studio.detail.where": "Where",
      "studio.detail.correction": "Proposed correction",
      "studio.detail.empty": "Select a suggestion to see the details.",
      "studio.actions.accept": "Accept",
      "studio.actions.ignore": "Ignore",
      "studio.actions.editAccept": "Edit then accept",

      "studio.actions.download": "Download modified CV",
      "studio.actions.downloadAts": "Linear ATS version",
      "studio.actions.print": "Print / PDF",
      "studio.actions.retest": "Retest",
      "studio.actions.proAnalyze": "Pro mode suggestions",
      "studio.actions.proPdf": "Download Pro PDF",
      "studio.pro.running": "Pro mode running…",
      "studio.pro.done": "Pro suggestions added to the list.",
      "studio.pro.error": "Pro mode unavailable — continue locally.",
      "studio.pro.needConsent": "Enable Pro mode on the upload screen to use this action.",
      "studio.jd.overlap": "Job ↔ CV alignment",

      "chat.title": "ATS Assistant",
      "chat.subtitle": "Common questions about the checker",
      "chat.fab.aria": "Open the ATS assistant",
      "chat.faq.mail": "Send an email",
      "chat.close": "Close",
      "chat.greeting": "Hello! Choose a question or contact us.",
      "chat.header.meta": "Common questions about the checker",
      "cookie.banner.manage": "Manage cookies",

      "footer.madeBy": "Made by",
      "footer.analysisLocal": "Local analysis in your browser.",

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
        "ATS Check is committed to making this site accessible in accordance with RGAA 4.1, WCAG 2.2 AA level, and the European Accessibility Act (2019/882) / EN 301 549 standard.",
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

