/**
 * Charge data/site.json et expose window.ATS_SITE.
 * Résout le chemin relatif selon la profondeur de page.
 */
(function () {
  function basePath() {
    const path = window.location.pathname || "";
    if (
      /\/(mentions-legales|confidentialite|cookies|accessibilite)\/?$/.test(path) ||
      /\/(mentions-legales|confidentialite|cookies|accessibilite)\/index\.html$/.test(path)
    ) {
      return "../";
    }
    return "";
  }

  window.ATS_BASE = basePath();

  window.ATSSiteConfig = {
    base: basePath(),
    ready: null,
    get() {
      return window.ATS_SITE || null;
    },
    async load() {
      if (window.ATS_SITE) return window.ATS_SITE;
      if (this.ready) return this.ready;
      this.ready = fetch(`${this.base}data/site.json`)
        .then((r) => {
          if (!r.ok) throw new Error("site.json introuvable");
          return r.json();
        })
        .then((data) => {
          window.ATS_SITE = data.site || data;
          document.dispatchEvent(new CustomEvent("ats:site-ready", { detail: window.ATS_SITE }));
          return window.ATS_SITE;
        })
        .catch((err) => {
          console.warn("[ATSSiteConfig]", err);
          window.ATS_SITE = {
            name: "ATS Check",
            email: "contact@ats-check.fr",
            dpoEmail: "dpo@ats-check.fr",
            url: "https://www.ats-check.fr/",
            gaId: "",
            adsId: "",
            themeColor: "#2c2a28",
            legal: {},
          };
          return window.ATS_SITE;
        });
      return this.ready;
    },
  };

  window.ATSSiteConfig.load();
})();
