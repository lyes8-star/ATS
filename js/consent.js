/**
 * CMP cookies ATS Check — Consent Mode v2 + stockage 12 mois.
 * Catégories : necessary | analytics | ads
 */
window.ATSConsent = (function () {
  const KEY = "ats-consent";
  const VERSION = 1;
  const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  const DEFAULT = {
    version: VERSION,
    necessary: true,
    analytics: false,
    ads: false,
    ts: 0,
  };

  let state = { ...DEFAULT };
  let listeners = [];

  function ensureGtagConsentDefault() {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
    window.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
      functionality_storage: "granted",
      security_storage: "granted",
      wait_for_update: 500,
    });
  }

  function applyConsentUpdate() {
    ensureGtagConsentDefault();
    window.gtag("consent", "update", {
      analytics_storage: state.analytics ? "granted" : "denied",
      ad_storage: state.ads ? "granted" : "denied",
      ad_user_data: state.ads ? "granted" : "denied",
      ad_personalization: state.ads ? "granted" : "denied",
    });
    listeners.forEach((fn) => {
      try {
        fn(get());
      } catch (_) {
        /* ignore */
      }
    });
    document.dispatchEvent(new CustomEvent("ats:consent", { detail: get() }));
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION) return null;
      if (!parsed.ts || Date.now() - parsed.ts > MAX_AGE_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function save(next) {
    state = {
      version: VERSION,
      necessary: true,
      analytics: !!next.analytics,
      ads: !!next.ads,
      ts: Date.now(),
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {
      /* ignore */
    }
    applyConsentUpdate();
    hideBanner();
  }

  function get() {
    return { ...state, decided: !!state.ts };
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function hideBanner() {
    document.getElementById("cookieBanner")?.remove();
    document.getElementById("cookieModal")?.remove();
    document.body.classList.remove("cookie-banner-open");
  }

  function legalBase() {
    return window.ATS_BASE || window.ATSSiteConfig?.base || "";
  }

  function showCustomize() {
    if (document.getElementById("cookieModal")) return;
    const base = legalBase();
    const modal = document.createElement("div");
    modal.id = "cookieModal";
    modal.className = "cookie-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "cookieModalTitle");
    modal.innerHTML = `
      <div class="cookie-modal__panel">
        <h2 id="cookieModalTitle">Personnaliser les cookies</h2>
        <p class="cookie-modal__intro">Les cookies nécessaires au fonctionnement du site sont toujours actifs. Vous pouvez accepter ou refuser les catégories facultatives.</p>
        <label class="cookie-opt"><input type="checkbox" checked disabled> Nécessaires <span>(toujours actifs)</span></label>
        <label class="cookie-opt"><input type="checkbox" id="cAnalytics" ${state.analytics ? "checked" : ""}> Mesure d’audience (Google Analytics)</label>
        <label class="cookie-opt"><input type="checkbox" id="cAds" ${state.ads ? "checked" : ""}> Publicité / Google Ads</label>
        <p class="cookie-modal__links"><a href="${base}cookies/">Politique cookies</a> · <a href="${base}confidentialite/">Confidentialité</a></p>
        <div class="cookie-modal__actions">
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieSavePrefs">Enregistrer</button>
          <button type="button" class="cookie-btn cookie-btn--primary" id="cookieAcceptAllModal">Tout accepter</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("cookieSavePrefs")?.addEventListener("click", () => {
      save({
        analytics: document.getElementById("cAnalytics")?.checked,
        ads: document.getElementById("cAds")?.checked,
      });
    });
    document.getElementById("cookieAcceptAllModal")?.addEventListener("click", () => {
      save({ analytics: true, ads: true });
    });
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
    document.addEventListener(
      "keydown",
      function onEsc(e) {
        if (e.key === "Escape") {
          modal.remove();
          document.removeEventListener("keydown", onEsc);
        }
      },
      { once: true }
    );
  }

  function showBanner() {
    if (document.getElementById("cookieBanner") || state.ts) return;
    const base = legalBase();
    const el = document.createElement("div");
    el.id = "cookieBanner";
    el.className = "cookie-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Consentement cookies");
    el.innerHTML = `
      <div class="cookie-banner__inner">
        <p class="cookie-banner__text">
          Nous utilisons des cookies essentiels au site et, avec votre accord, des outils de mesure d’audience et de publicité (Google).
          L’analyse de votre CV reste locale dans votre navigateur.
          <a href="${base}cookies/">En savoir plus</a>
        </p>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieRefuse">Refuser</button>
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieCustomize">Personnaliser</button>
          <button type="button" class="cookie-btn cookie-btn--primary" id="cookieAccept">Accepter</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    document.body.classList.add("cookie-banner-open");
    document.getElementById("cookieRefuse")?.addEventListener("click", () => {
      save({ analytics: false, ads: false });
    });
    document.getElementById("cookieAccept")?.addEventListener("click", () => {
      save({ analytics: true, ads: true });
    });
    document.getElementById("cookieCustomize")?.addEventListener("click", showCustomize);
  }

  function openManager() {
    const saved = load();
    if (saved) state = { ...DEFAULT, ...saved, necessary: true };
    showCustomize();
  }

  function init() {
    ensureGtagConsentDefault();
    const saved = load();
    if (saved) {
      state = { ...DEFAULT, ...saved, necessary: true };
      applyConsentUpdate();
    } else {
      state = { ...DEFAULT };
      applyConsentUpdate();
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", showBanner);
      } else {
        showBanner();
      }
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-manage-cookies]");
      if (btn) {
        e.preventDefault();
        openManager();
      }
    });
  }

  return {
    init,
    get,
    save,
    onChange,
    openManager,
    allowsAnalytics: () => !!get().analytics,
    allowsAds: () => !!get().ads,
  };
})();

window.ATSConsent.init();
