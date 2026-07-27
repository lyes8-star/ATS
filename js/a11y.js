/**
 * Paramètres d’accessibilité Test Mon CV — WCAG 2.2 / RGAA.
 */
window.ATSA11y = (function () {
  const STORAGE_KEY = "ats-a11y";
  const FONT_STEPS = [100, 112, 125, 150];

  const DEFAULTS = {
    fontScale: 100,
    contrast: false,
    links: false,
    spacing: false,
    readable: false,
    motion: false,
  };

  let prefs = { ...DEFAULTS };
  let panelOpen = false;
  let lastFocused = null;
  let fabEl = null;
  let panelEl = null;

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {
      /* ignore */
    }
  }

  function applyPrefs(next) {
    prefs = { ...DEFAULTS, ...next };
    const root = document.documentElement;

    FONT_STEPS.forEach((s) => root.classList.remove(`a11y-font-${s}`));
    if (prefs.fontScale !== 100) {
      root.classList.add(`a11y-font-${prefs.fontScale}`);
    }
    root.style.setProperty("--a11y-font-scale", `${prefs.fontScale / 100}`);

    root.classList.toggle("a11y-contrast", !!prefs.contrast);
    root.classList.toggle("a11y-links", !!prefs.links);
    root.classList.toggle("a11y-spacing", !!prefs.spacing);
    root.classList.toggle("a11y-readable", !!prefs.readable);
    root.classList.toggle("a11y-motion", !!prefs.motion);

    if (!prefs.motion && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("a11y-motion");
    }

    savePrefs();
    syncPanelUI();
  }

  function syncPanelUI() {
    if (!panelEl) return;
    const scale = panelEl.querySelector("#a11yFontScale");
    if (scale) scale.value = String(prefs.fontScale);
    const scaleLabel = panelEl.querySelector("#a11yFontScaleValue");
    if (scaleLabel) scaleLabel.textContent = `${prefs.fontScale} %`;

    [
      ["a11yContrast", prefs.contrast],
      ["a11yLinks", prefs.links],
      ["a11ySpacing", prefs.spacing],
      ["a11yReadable", prefs.readable],
      ["a11yMotion", prefs.motion],
    ].forEach(([id, on]) => {
      const el = panelEl.querySelector(`#${id}`);
      if (el) el.checked = !!on;
    });
  }

  function declarationHref() {
    const base = window.ATS_BASE || "";
    return `${base}accessibilite/`;
  }

  function ensureDom() {
    if (document.getElementById("a11yFab")) {
      fabEl = document.getElementById("a11yFab");
      panelEl = document.getElementById("a11yPanel");
      return;
    }

    fabEl = document.createElement("button");
    fabEl.type = "button";
    fabEl.id = "a11yFab";
    fabEl.className = "fab-a11y";
    fabEl.setAttribute("aria-label", "Paramètres d’accessibilité");
    fabEl.setAttribute("aria-haspopup", "dialog");
    fabEl.setAttribute("aria-expanded", "false");
    fabEl.setAttribute("aria-controls", "a11yPanel");
    fabEl.innerHTML = `<span class="fab-a11y__icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="4" r="2"/><path d="M12 6v4M8 10h8M10 10l-2 10M14 10l2 10M9 14h6"/>
      </svg>
    </span>`;

    panelEl = document.createElement("div");
    panelEl.id = "a11yPanel";
    panelEl.className = "a11y-panel";
    panelEl.hidden = true;
    panelEl.innerHTML = `
      <div class="a11y-panel__backdrop" data-a11y-close tabindex="-1"></div>
      <div class="a11y-panel__dialog" role="dialog" aria-modal="true" aria-labelledby="a11yPanelTitle">
        <header class="a11y-panel__header">
          <div>
            <h2 id="a11yPanelTitle" class="a11y-panel__title">Paramètres d’accessibilité</h2>
            <p class="a11y-panel__lead">Ajustez l’affichage selon vos besoins (WCAG 2.2 / RGAA 4.1).</p>
          </div>
          <button type="button" class="a11y-panel__close" data-a11y-close aria-label="Fermer les paramètres">×</button>
        </header>
        <div class="a11y-panel__body">
          <div class="a11y-field">
            <label for="a11yFontScale">Taille du texte <span id="a11yFontScaleValue">100 %</span></label>
            <input type="range" id="a11yFontScale" min="100" max="150" step="12.5" list="a11yFontSteps" value="100">
            <datalist id="a11yFontSteps">
              <option value="100" label="100%"></option>
              <option value="112" label="112%"></option>
              <option value="125" label="125%"></option>
              <option value="150" label="150%"></option>
            </datalist>
          </div>
          <label class="a11y-switch"><input type="checkbox" id="a11yContrast"><span>Contraste renforcé</span></label>
          <label class="a11y-switch"><input type="checkbox" id="a11yLinks"><span>Souligner les liens</span></label>
          <label class="a11y-switch"><input type="checkbox" id="a11ySpacing"><span>Espacement du texte augmenté</span></label>
          <label class="a11y-switch"><input type="checkbox" id="a11yReadable"><span>Police plus lisible</span></label>
          <label class="a11y-switch"><input type="checkbox" id="a11yMotion"><span>Réduire les animations</span></label>
        </div>
        <footer class="a11y-panel__footer">
          <button type="button" class="cookie-btn cookie-btn--outline" id="a11yReset">Réinitialiser</button>
          <a class="a11y-panel__decl" href="${declarationHref()}">Déclaration d’accessibilité</a>
        </footer>
      </div>
    `;

    document.body.appendChild(fabEl);
    document.body.appendChild(panelEl);
  }

  function openPanel() {
    ensureDom();
    if (panelOpen) return;
    panelOpen = true;
    lastFocused = document.activeElement;
    panelEl.hidden = false;
    requestAnimationFrame(() => panelEl.classList.add("is-open"));
    fabEl.setAttribute("aria-expanded", "true");
    document.body.classList.add("a11y-panel-open");
    syncPanelUI();
    setTimeout(() => panelEl.querySelector(".a11y-panel__close")?.focus(), 40);
  }

  function closePanel() {
    if (!panelEl || !panelOpen) return;
    panelOpen = false;
    panelEl.classList.remove("is-open");
    fabEl?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("a11y-panel-open");
    setTimeout(() => {
      panelEl.hidden = true;
      if (lastFocused && typeof lastFocused.focus === "function") {
        try {
          lastFocused.focus();
        } catch (_) {
          /* ignore */
        }
      }
    }, 200);
  }

  function nearestFontStep(value) {
    const n = Number(value);
    return FONT_STEPS.reduce((best, step) =>
      Math.abs(step - n) < Math.abs(best - n) ? step : best
    );
  }

  function bindEvents() {
    ensureDom();
    fabEl.addEventListener("click", () => (panelOpen ? closePanel() : openPanel()));
    panelEl.addEventListener("click", (e) => {
      if (e.target.closest("[data-a11y-close]")) closePanel();
    });
    panelEl.querySelector("#a11yFontScale")?.addEventListener("input", (e) => {
      const step = nearestFontStep(e.target.value);
      e.target.value = String(step);
      applyPrefs({ ...prefs, fontScale: step });
    });
    [
      ["a11yContrast", "contrast"],
      ["a11yLinks", "links"],
      ["a11ySpacing", "spacing"],
      ["a11yReadable", "readable"],
      ["a11yMotion", "motion"],
    ].forEach(([id, key]) => {
      panelEl.querySelector(`#${id}`)?.addEventListener("change", (e) => {
        applyPrefs({ ...prefs, [key]: e.target.checked });
      });
    });
    panelEl.querySelector("#a11yReset")?.addEventListener("click", () => applyPrefs({ ...DEFAULTS }));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && panelOpen) {
        e.preventDefault();
        closePanel();
      }
    });
  }

  function init() {
    prefs = loadPrefs();
    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY);
      } catch (_) {
        return null;
      }
    })();
    if (!stored && window.matchMedia("(prefers-contrast: more)").matches) {
      prefs.contrast = true;
    }
    applyPrefs(prefs);
    ensureDom();
    bindEvents();
    const decl = panelEl?.querySelector(".a11y-panel__decl");
    if (decl) decl.setAttribute("href", declarationHref());
  }

  return { init, open: openPanel, close: closePanel };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => window.ATSA11y.init());
} else {
  window.ATSA11y.init();
}
