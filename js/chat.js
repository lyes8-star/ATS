/**
 * Assistant ATS — FAQ guidée + mailto.
 */
window.ATSChat = (function () {
  const FAQ = [
    {
      q: "Comment est calculé le score ATS ?",
      a: "Le score /100 agrège 4 axes (/25) : lisibilité (texte extractible), structure (sections, coordonnées), qualité du contenu (verbes d’action, chiffres) et mots-clés professionnels.",
    },
    {
      q: "Quels formats sont acceptés ?",
      a: "PDF et DOCX jusqu’à 10 Mo. Les scans/images sans texte extractible scoreront mal : privilégiez un CV texte.",
    },
    {
      q: "Mes données sont-elles envoyées sur un serveur ?",
      a: "Non. L’analyse se fait entièrement dans votre navigateur. Aucun fichier CV n’est uploadé. Voir la politique de confidentialité.",
    },
    {
      q: "Que faire si mon score est faible ?",
      a: "Corrigez d’abord les points bloquants : email/téléphone, sections Expérience/Formation, verbes d’action et résultats chiffrés. Relancez ensuite l’analyse.",
    },
    {
      q: "Les fautes d’orthographe comptent-elles ?",
      a: "Oui pour les recruteurs. Nous signalons les fautes fréquentes FR/EN ; elles n’entrent pas toutes dans le score /100 mais restent un signal négatif fort.",
    },
  ];

  let open = false;
  let fabEl = null;
  let panelEl = null;
  let lastFocused = null;

  function email() {
    return window.ATS_SITE?.email || "contact@ats-check.fr";
  }

  function track(name, params) {
    if (window.ATSAnalytics?.track) window.ATSAnalytics.track(name, params || {});
  }

  function ensureDom() {
    if (document.getElementById("atsChatFab")) {
      fabEl = document.getElementById("atsChatFab");
      panelEl = document.getElementById("atsChatPanel");
      return;
    }

    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.id = "atsChatFab";
    fabEl.className = "fab-chat";
    fabEl.setAttribute("aria-label", "Ouvrir l’assistant ATS");
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
            <h2 id="atsChatTitle">Assistant ATS</h2>
            <p>Questions fréquentes sur le vérificateur</p>
          </div>
          <button type="button" class="chat-panel__close" data-chat-close aria-label="Fermer">×</button>
        </header>
        <div class="chat-panel__body" id="atsChatBody">
          <div class="chat-bubble chat-bubble--bot">Bonjour ! Choisissez une question ou contactez-nous.</div>
          <div class="chat-faq" id="atsChatFaq"></div>
        </div>
        <footer class="chat-panel__footer">
          <a class="cookie-btn cookie-btn--primary" id="atsChatMail" href="mailto:${email()}?subject=Question%20ATS%20Check">Écrire un e-mail</a>
        </footer>
      </div>
    `;

    document.body.appendChild(fabEl);
    document.body.appendChild(panelEl);

    const faq = panelEl.querySelector("#atsChatFaq");
    FAQ.forEach((item, i) => {
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
      faq.appendChild(btn);
    });
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
    if (mail) mail.href = `mailto:${email()}?subject=${encodeURIComponent("Question ATS Check")}`;

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
      if (m) m.href = `mailto:${email()}?subject=${encodeURIComponent("Question ATS Check")}`;
    });
  }

  return { init, open: openPanel, close: closePanel };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.ATSChat.init());
} else {
  window.ATSChat.init();
}
