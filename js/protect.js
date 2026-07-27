/**
 * Dissuasion anti-copie (pas une protection absolue).
 * Désactivé en mode accessibilité / champs éditables / panels.
 * Aligné sur Test2/js/protect.js.
 */
(function () {
  const EDITABLE_SEL =
    "input, textarea, select, [contenteditable=\"true\"], .a11y-panel, .chat-panel, .cookie-banner, .cookie-modal, .fab-a11y, .dropzone";
  const SELECTABLE_SEL =
    ".site-footer, .footer-legal, a[href^=\"tel:\"], a[href^=\"mailto:\"], .legal-article, .cookie-banner, .score-card";

  function hasA11yMode() {
    const root = document.documentElement;
    return Array.from(root.classList).some((c) => c.startsWith("a11y-"));
  }

  function isEditableTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    return !!el.closest(EDITABLE_SEL);
  }

  function isSelectableTarget(el) {
    if (!el || el.nodeType !== 1) return false;
    return !!el.closest(SELECTABLE_SEL);
  }

  function locksEnabled() {
    if (hasA11yMode()) return false;
    return true;
  }

  function syncLockClass() {
    document.documentElement.classList.toggle("protect-lock", locksEnabled());
  }

  document.addEventListener(
    "contextmenu",
    (e) => {
      if (locksEnabled() && !isEditableTarget(e.target) && !isSelectableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener(
    "dragstart",
    (e) => {
      if (locksEnabled() && !isEditableTarget(e.target)) e.preventDefault();
    },
    true
  );

  document.addEventListener(
    "selectstart",
    (e) => {
      if (locksEnabled() && !isEditableTarget(e.target) && !isSelectableTarget(e.target)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener("keydown", (e) => {
    if (!locksEnabled()) return;
    const key = e.key?.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && ["u", "s", "p"].includes(key)) {
      if (!isEditableTarget(e.target)) e.preventDefault();
    }
    if (ctrl && e.shiftKey && ["i", "j", "c"].includes(key)) {
      e.preventDefault();
    }
    if (key === "f12") e.preventDefault();
  });

  syncLockClass();
  const obs = new MutationObserver(syncLockClass);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
