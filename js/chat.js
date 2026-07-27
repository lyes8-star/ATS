/**
 * Aide Test Mon CV — FAQ guidée + mailto.
 */
window.ATSChat = (function () {
  const FAQ_BY_LANG = {
    fr: [
      {
        q: "Comment est calculé le score ?",
        a: "Le score /100 agrège 4 axes (/25) : lisibilité (texte extractible), structure (sections, coordonnées), qualité du contenu (verbes d’action, chiffres) et mots-clés professionnels.",
      },
      {
        q: "Quels formats sont acceptés ?",
        a: "PDF et DOCX jusqu’à 10 Mo. Les scans/images sans texte extractible scoreront mal : privilégiez un CV texte.",
      },
      {
        q: "Mes données sont-elles envoyées sur un serveur ?",
        a: "Par défaut non : l’analyse locale reste dans votre navigateur. Avec « Enrichissement Extrait », un extrait (texte / image d’en-tête) part temporairement vers notre Worker (grammaire, géocode, photo). Avec Mode Pro, le texte du CV part aussi pour LLM / ESCO / PDF. Aucune conservation longue. Voir la politique de confidentialité.",
      },
      {
        q: "Qu’est-ce que le Mode Pro ?",
        a: "Option consentie : suggestions LLM, matching compétences ESCO, et export PDF avancé via un Worker Cloudflare. Sans Mode Pro ni Extrait, tout reste 100 % local.",
      },
      {
        q: "Qu’est-ce que l’Enrichissement Extrait ?",
        a: "Option plus légère que le Mode Pro : envoi temporaire d’un extrait pour LanguageTool, géocodage d’adresse et classification photo vs logo. Pas d’IA générative.",
      },
      {
        q: "Que faire si mon score est faible ?",
        a: "Corrigez d’abord les points bloquants : email/téléphone, sections Expérience/Formation, verbes d’action et résultats chiffrés. Relancez ensuite le contrôle.",
      },
      {
        q: "Les fautes d’orthographe comptent-elles ?",
        a: "Oui pour les recruteurs. Nous signalons les fautes fréquentes FR/EN ; elles n’entrent pas toutes dans le score /100 mais restent un signal négatif fort.",
      },
    ],
    en: [
      {
        q: "How is the score calculated?",
        a: "The /100 score aggregates 4 axes (/25): extractability (machine-readable text), structure (sections, contact details), content quality (action verbs, numbers) and professional keywords.",
      },
      {
        q: "Which formats are accepted?",
        a: "PDF and DOCX up to 10 MB. Scans/images without extractable text will score poorly — choose a text-based CV.",
      },
      {
        q: "Are my data sent to a server?",
        a: "By default no — local analysis stays in your browser. With Extract enrichment, a short extract (text / header image) is sent temporarily for grammar, geocoding and photo classification. With Pro mode, CV text is also sent for LLM / ESCO / PDF. No long-term retention. See the privacy policy.",
      },
      {
        q: "What is Pro mode?",
        a: "An opt-in: LLM suggestions, ESCO skill matching, and advanced PDF export via a Cloudflare Worker. Without Pro or Extract, everything stays 100% local.",
      },
      {
        q: "What is Extract enrichment?",
        a: "A lighter opt-in than Pro: temporary extract for LanguageTool, address geocoding, and photo vs logo classification. No generative AI.",
      },
      {
        q: "What should I do if my score is low?",
        a: "First fix the blocking issues: email/phone, Experience/Education sections, action verbs, and quantified results. Then run the check again.",
      },
      {
        q: "Do spelling mistakes matter?",
        a: "Yes for recruiters. We flag common FR/EN spelling issues — not all of them count toward the /100 score, but they remain a negative signal.",
      },
    ],
  };

  function getFAQ() {
    const lang = window.ATSi18n?.getLang?.() || "fr";
    return FAQ_BY_LANG[lang] || FAQ_BY_LANG.fr;
  }

  let open = false;
  let fabEl = null;
  let panelEl = null;
  let lastFocused = null;

  function email() {
    return window.ATS_SITE?.email || "contact@testmoncv.fr";
  }

  function track(name, params) {
    if (window.ATSAnalytics?.track) window.ATSAnalytics.track(name, params || {});
  }

  function ensureDom() {
    if (document.getElementById("atsChatFab")) {
      fabEl = document.getElementById("atsChatFab");
      panelEl = document.getElementById("atsChatPanel");
      // Refresh language-dependent texts (e.g. when user switches FR/EN).
      renderHeaderAndFAQ();
      return;
    }

    function renderHeaderAndFAQ() {
      if (!panelEl) return;
      const t = window.ATSi18n?.t || ((k) => k);
      const faqRoot = panelEl.querySelector("#atsChatFaq");
      const titleEl = panelEl.querySelector("#atsChatTitle");
      const subtitleEl = panelEl.querySelector(".chat-panel__header p");

      if (titleEl) titleEl.textContent = t("chat.title");
      if (subtitleEl) subtitleEl.textContent = t("chat.subtitle");

      const greeting = panelEl.querySelector(".chat-bubble--bot");
      if (greeting) greeting.textContent = t("chat.greeting");

      if (faqRoot) {
        faqRoot.innerHTML = "";
        getFAQ().forEach((item, i) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chat-faq__btn";
          btn.textContent = item.q;
          btn.addEventListener("click", () => {
            track("chat_faq_click", { index: i });
            const body = panelEl.querySelector("#atsChatBody");
            const u = document.createElement("div");
            u.className = "chat-bubble chat-bubble--user";
            u.textContent = item.q;
            const b = document.createElement("div");
            b.className = "chat-bubble chat-bubble--bot";
            b.textContent = item.a;
            body.appendChild(u);
            body.appendChild(b);
            body.scrollTop = body.scrollHeight;
          });
          faqRoot.appendChild(btn);
        });
      }
    }

    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.id = "atsChatFab";
    fabEl.className = "fab-chat";
    fabEl.setAttribute(
      "aria-label",
      window.ATSi18n?.t?.("chat.fab.aria") || "Ouvrir l’assistant ATS"
    );
    fabEl.setAttribute("aria-haspopup", "dialog");
    fabEl.setAttribute("aria-expanded", "false");
    fabEl.setAttribute("aria-controls", "atsChatPanel");
    fabEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;

    panelEl = document.createElement("div");
    panelEl.id = "atsChatPanel";
    panelEl.className = "chat-panel";
    panelEl.hidden = true;
    panelEl.innerHTML = `
      <div class="chat-panel__backdrop" data-chat-close tabindex="-1"></div>
      <div class="chat-panel__dialog" role="dialog" aria-modal="true" aria-labelledby="atsChatTitle">
        <header class="chat-panel__header">
          <div>
            <h2 id="atsChatTitle">${window.ATSi18n?.t?.("chat.title") || "Assistant ATS"}</h2>
            <p>${window.ATSi18n?.t?.("chat.subtitle") || "Questions fréquentes sur le vérificateur"}</p>
          </div>
          <button type="button" class="chat-panel__close" data-chat-close aria-label="${window.ATSi18n?.t?.("chat.close") || "Fermer"}">×</button>
        </header>
        <div class="chat-panel__body" id="atsChatBody">
          <div class="chat-bubble chat-bubble--bot">${window.ATSi18n?.t?.("chat.greeting") || "Bonjour ! Choisissez une question ou contactez-nous."}</div>
          <div class="chat-faq" id="atsChatFaq"></div>
        </div>
        <footer class="chat-panel__footer">
          <a class="cookie-btn cookie-btn--primary" id="atsChatMail" href="mailto:${email()}?subject=Question%20ATS%20Check">${window.ATSi18n?.t?.("chat.faq.mail") || "Écrire un e-mail"}</a>
        </footer>
      </div>
    `;

    document.body.appendChild(fabEl);
    document.body.appendChild(panelEl);

    renderHeaderAndFAQ();
  }

  function openPanel() {
    ensureDom();
    if (open) return;
    open = true;
    lastFocused = document.activeElement;
    panelEl.hidden = false;
    requestAnimationFrame(() => panelEl.classList.add("is-open"));
    fabEl.setAttribute("aria-expanded", "true");
    track("chat_open");
    setTimeout(() => panelEl.querySelector(".chat-panel__close")?.focus(), 40);
  }

  function closePanel() {
    if (!panelEl || !open) return;
    open = false;
    panelEl.classList.remove("is-open");
    fabEl?.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      panelEl.hidden = true;
      lastFocused?.focus?.();
    }, 200);
  }

  function init() {
    ensureDom();
    const mail = panelEl.querySelector("#atsChatMail");
    if (mail) mail.href = `mailto:${email()}?subject=${encodeURIComponent("Question Test Mon CV")}`;

    fabEl.addEventListener("click", () => (open ? closePanel() : openPanel()));
    panelEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-chat-close]")) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        closePanel();
      }
    });
    document.addEventListener("ats:site-ready", () => {
      const m = document.getElementById("atsChatMail");
      if (m) m.href = `mailto:${email()}?subject=${encodeURIComponent("Question Test Mon CV")}`;
    });

    document.addEventListener("ats:lang-changed", () => {
      ensureDom();
    });
  }

  return { init, open: openPanel, close: closePanel };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.ATSChat.init());
} else {
  window.ATSChat.init();
}
