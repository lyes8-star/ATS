/**
 * Boot ATS — enchaîne config, analytics, SEO, service worker.
 */
(async function () {
  const site = await (window.ATSSiteConfig?.load?.() || Promise.resolve(window.ATS_SITE));

  // Hydrate dynamic year (footer credit).
  document
    .querySelectorAll("[data-year]")
    .forEach((el) => (el.textContent = String(new Date().getFullYear())));

  if (window.ATSAnalytics) {
    window.ATSAnalytics.init({
      gaId: site?.gaId || "",
      adsId: site?.adsId || "",
    });
  }

  if (window.ATSSeo && site) {
    window.ATSSeo.init(site);
  }

  // Register service worker
  if ("serviceWorker" in navigator) {
    const base = window.ATS_BASE || "";
    // Only register from site root pages (or when base resolves to root)
    const swUrl = `${base}sw.js`;
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope: base || "./" });
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    } catch (err) {
      console.warn("[SW]", err);
    }
  }
})();
