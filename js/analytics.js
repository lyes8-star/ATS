/**
 * Couche SEA / analytics ATS — charge gtag uniquement après consentement CMP.
 */
window.ATSAnalytics = (function () {
  let ready = false;
  let adsId = "";
  let gaId = "";

  function readMeta(name) {
    return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content")?.trim() || "";
  }

  function ensureDataLayer() {
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function () {
        window.dataLayer.push(arguments);
      };
  }

  function canLoad() {
    const c = window.ATSConsent?.get?.();
    if (!c) return false;
    return !!(c.analytics || c.ads);
  }

  function loadGtag(id) {
    if (!id || document.getElementById("ats-gtag")) return;
    if (!canLoad()) return;
    const s = document.createElement("script");
    s.id = "ats-gtag";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(s);
    ensureDataLayer();
    window.gtag("js", new Date());
    window.gtag("config", id, { anonymize_ip: true });
  }

  function start() {
    const primary = gaId || adsId;
    if (!primary || !canLoad()) {
      ready = false;
      ensureDataLayer();
      return;
    }
    loadGtag(primary);
    if (adsId && gaId && adsId !== gaId && canLoad()) {
      ensureDataLayer();
      window.gtag("config", adsId);
    }
    ready = true;
  }

  function init(options = {}) {
    const site = window.ATS_SITE || {};
    adsId = options.adsId || window.ATS_ADS_ID || site.adsId || readMeta("ats-ads-id") || "";
    gaId = options.gaId || window.ATS_GA_ID || site.gaId || readMeta("ats-ga-id") || "";
    ensureDataLayer();
    start();
    if (window.ATSConsent?.onChange) {
      window.ATSConsent.onChange(() => start());
    }
    document.addEventListener("ats:consent", () => start());
  }

  function track(eventName, params) {
    ensureDataLayer();
    const payload = Object.assign({ event: eventName }, params || {});
    window.dataLayer.push(payload);
    if (typeof window.gtag === "function" && ready && canLoad()) {
      window.gtag("event", eventName, params || {});
    }
  }

  return { init, track };
})();
