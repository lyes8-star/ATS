/**
 * Google Maps popup dans la barre de contact — iframe chargée uniquement après consentement ads.
 * 100% client-side.
 */
(function () {
  const SYNC_FNS = [];

  function getSite() {
    return window.ATSSiteConfig?.get?.() || window.ATS_SITE || null;
  }

  function formatAddress(address) {
    if (!address) return "";
    if (typeof address === "string") return address;
    const street = address.street || "";
    const postal = address.postalCode || address.postalcode || address.postal || "";
    const city = address.city || "";
    const parts = [];
    if (street) parts.push(street);
    const tail = [postal, city].filter(Boolean).join(" ").trim();
    if (tail) parts.push(tail);
    return parts.join(", ");
  }

  function mapsUrls(query) {
    const q = encodeURIComponent(query);
    return {
      embed: `https://maps.google.com/maps?q=${q}&z=15&hl=fr&output=embed`,
      open: `https://www.google.com/maps/search/?api=1&query=${q}`,
    };
  }

  function adsAllowed() {
    return !!window.ATSConsent?.allowsAds?.();
  }

  function setTopbarTextAndLinks(site) {
    const topbar = document.getElementById("topbar");
    if (topbar) topbar.classList.remove("hidden");

    const phoneText = document.getElementById("topbarPhoneText");
    const phoneLink = document.getElementById("topbarPhone");
    const emailText = document.getElementById("topbarEmailText");
    const emailLink = document.getElementById("topbarEmail");
    const hoursText = document.getElementById("topbarHoursText");
    const addressText = document.getElementById("topbarAddressText");

    const address = formatAddress(site?.address);
    const phone = site?.phone || "";
    const phoneDisplay = site?.phoneDisplay || site?.phoneDisplay || phone || "";

    if (phoneText) phoneText.textContent = phoneDisplay;
    if (phoneLink) {
      const tel = String(phone).replace(/\s+/g, "");
      phoneLink.href = tel ? `tel:${tel}` : "#";
    }

    if (emailText) emailText.textContent = site?.email || "";
    if (emailLink) emailLink.href = site?.email ? `mailto:${site.email}` : "#";

    if (hoursText) hoursText.textContent = site?.hours || "";
    if (addressText) addressText.textContent = address || "";
  }

  function setupMaps(site) {
    SYNC_FNS.length = 0;
    if (!site) return;

    const query = formatAddress(site.address);
    if (!query) return;
    const urls = mapsUrls(query);

    const triggers = document.querySelectorAll(".address-map-trigger");
    triggers.forEach((trigger) => {
      const embedEl = trigger.querySelector("[data-map-embed]");
      const consentBtn = trigger.querySelector("[data-map-consent]");
      const openLink = trigger.querySelector("[data-map-open]");
      if (!embedEl || !consentBtn || !openLink) return;

      // Prefill open link (but it stays hidden until ads allowed).
      openLink.href = urls.open;

      const sync = function () {
        const allowed = adsAllowed();
        if (consentBtn) consentBtn.classList.toggle("hidden", allowed);
        if (openLink) openLink.classList.toggle("hidden", !allowed);

        if (allowed) {
          if (!embedEl.querySelector("iframe")) {
            const iframe = document.createElement("iframe");
            iframe.title = "Carte Google Maps";
            iframe.loading = "lazy";
            iframe.referrerPolicy = "no-referrer-when-downgrade";
            iframe.allowFullscreen = true;
            iframe.src = urls.embed;
            iframe.setAttribute("aria-hidden", "true");
            iframe.style.width = "100%";
            iframe.style.height = "280px";
            iframe.style.border = "0";
            embedEl.innerHTML = "";
            embedEl.appendChild(iframe);
          }
        } else {
          embedEl.innerHTML = "";
          iframeRemoveFocus();
        }
      };

      function iframeRemoveFocus() {
        // Avoid leaving focus on a removed iframe.
        if (document.activeElement && embedEl.contains(document.activeElement)) {
          try {
            embedEl.querySelector(".address-map-consent")?.focus?.();
          } catch (_) {}
        }
      }

      consentBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.ATSConsent?.openManager?.();
      });

      // Initial sync.
      sync();
      SYNC_FNS.push(sync);
    });
  }

  function init() {
    const site = getSite();
    if (!site) return;
    setTopbarTextAndLinks(site);
    setupMaps(site);
  }

  // Consent changes => update iframe.
  document.addEventListener("ats:consent", () => {
    SYNC_FNS.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  });

  // Site config ready => populate.
  document.addEventListener("ats:site-ready", () => init());

  // If already loaded.
  if (getSite()) {
    init();
  }
})();

