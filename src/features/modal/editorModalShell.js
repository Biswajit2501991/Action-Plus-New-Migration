/** Default stacking for full-screen editor modals (below toast 9999, above sticky chrome). */
export const EDITOR_MODAL_Z_INDEX = 70;

export const PHOTO_PICKER_MODAL_Z_INDEX = 80;

/** Stacked above Edit Member (z-50), below photo source picker (z-80). */
export const PHOTO_PREVIEW_MODAL_Z_INDEX = 78;

/** Scroll window + `.apg-main-scroll` to top before opening a centered editor. */
export function scrollEditorToTop(doc = document) {
  if (!doc || typeof doc.querySelector !== 'function') return;
  try {
    doc.defaultView?.scrollTo?.({ top: 0, behavior: 'smooth' });
  } catch {
    try { doc.defaultView?.scrollTo?.(0, 0); } catch {}
  }
  const main = doc.querySelector('.apg-body > main.apg-main-scroll');
  if (!main) return;
  try {
    main.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {
    main.scrollTop = 0;
  }
}

/** @returns {() => void} cleanup */
export function bindModalEscapeKey(onClose, doc = document) {
  if (!doc || typeof onClose !== 'function') return () => {};
  const handler = (e) => {
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      onClose();
    }
  };
  doc.addEventListener('keydown', handler);
  return () => doc.removeEventListener('keydown', handler);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Minimal focus trap for modal panels (no external deps). @returns {() => void} */
export function bindFocusTrap(container, doc = document) {
  if (!container || !doc) return () => {};
  const focusables = () => Array.from(container.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return el.offsetParent !== null || el === doc.activeElement;
  });
  const initial = focusables();
  const first = initial[0];
  if (first && typeof first.focus === 'function') {
    requestAnimationFrame(() => {
      try { first.focus(); } catch {}
    });
  }
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const list = focusables();
    if (!list.length) return;
    const active = doc.activeElement;
    const idx = list.indexOf(active);
    if (e.shiftKey) {
      if (idx <= 0) {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    } else if (idx === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}
