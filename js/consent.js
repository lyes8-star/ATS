/**
 * CMP cookies Test Mon CV — Consent Mode v2 + stockage 12 mois.
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
    const t = window.ATSi18n?.t || ((k) => k);
    const modal = document.createElement("div");
    modal.id = "cookieModal";
    modal.className = "cookie-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "cookieModalTitle");
    modal.innerHTML = `
      <div class="cookie-modal__panel">
        <h2 id="cookieModalTitle">${t("consent.modal.title")}</h2>
        <p class="cookie-modal__intro">${t("consent.modal.intro")}</p>
        <label class="cookie-opt"><input type="checkbox" checked disabled> ${t(
          "consent.modal.labels.necessary"
        )} <span>${t("consent.modal.labels.necessarySuffix")}</span></label>
        <label class="cookie-opt"><input type="checkbox" id="cAnalytics" ${
          state.analytics ? "checked" : ""
        }> ${t("consent.modal.labels.analytics")}</label>
        <label class="cookie-opt"><input type="checkbox" id="cAds" ${
          state.ads ? "checked" : ""
        }> ${t("consent.modal.labels.ads")}</label>
        <p class="cookie-modal__links"><a href="${base}cookies/">${t(
          "consent.modal.links.cookies"
        )}</a> · <a href="${base}confidentialite/">${t(
          "consent.modal.links.privacy"
        )}</a></p>
        <div class="cookie-modal__actions">
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieSavePrefs">${t(
            "consent.modal.actions.save"
          )}</button>
          <button type="button" class="cookie-btn cookie-btn--primary" id="cookieAcceptAllModal">${t(
            "consent.modal.actions.acceptAll"
          )}</button>
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
    const t = window.ATSi18n?.t || ((k) => k);
    const el = document.createElement("div");
    el.id = "cookieBanner";
    el.className = "cookie-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", t("consent.banner.aria"));
    el.innerHTML = `
      <div class="cookie-banner__inner">
        <p class="cookie-banner__text">
          ${t("consent.banner.text")}
          <a href="${base}cookies/">${t("consent.banner.learnMore")}</a>
        </p>
        <div class="cookie-banner__actions">
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieRefuse">${t(
            "consent.banner.refuse"
          )}</button>
          <button type="button" class="cookie-btn cookie-btn--outline" id="cookieCustomize">${t(
            "consent.banner.customize"
          )}</button>
          <button type="button" class="cookie-btn cookie-btn--primary" id="cookieAccept">${t(
            "consent.banner.accept"
          )}</button>
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

    // Re-render CMP UI when the user switches FR/EN.
    document.addEventListener("ats:lang-changed", () => {
      const modal = document.getElementById("cookieModal");
      if (modal) {
        modal.remove();
        showCustomize();
        return;
      }
      const banner = document.getElementById("cookieBanner");
      if (banner) {
        banner.remove();
        showBanner();
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
