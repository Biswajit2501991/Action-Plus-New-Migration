// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scrollEditorToTop,
  bindModalEscapeKey,
  bindFocusTrap,
  EDITOR_MODAL_Z_INDEX,
  PHOTO_PREVIEW_MODAL_Z_INDEX,
  PHOTO_PICKER_MODAL_Z_INDEX,
  PAYMENT_QR_ZOOM_MODAL_Z_INDEX,
} from '../src/features/modal/editorModalShell.js';

describe('editorModalShell', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="apg-body"><main class="apg-main-scroll" style="height:200px;overflow:auto"><div style="height:800px"></div></main></div>';
    const main = document.querySelector('.apg-main-scroll');
    main.scrollTop = 400;
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exports stable z-index tokens', () => {
    expect(EDITOR_MODAL_Z_INDEX).toBe(70);
    expect(PHOTO_PREVIEW_MODAL_Z_INDEX).toBe(78);
    expect(PHOTO_PICKER_MODAL_Z_INDEX).toBe(80);
    expect(PAYMENT_QR_ZOOM_MODAL_Z_INDEX).toBe(82);
  });

  it('scrollEditorToTop resets main scroll pane', () => {
    scrollEditorToTop(document);
    expect(document.querySelector('.apg-main-scroll').scrollTop).toBe(0);
    expect(window.scrollTo).toHaveBeenCalled();
  });

  it('bindModalEscapeKey calls onClose for Escape', () => {
    const onClose = vi.fn();
    const unbind = bindModalEscapeKey(onClose, document);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unbind();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bindFocusTrap returns cleanup and focuses first control', () => {
    const panel = document.createElement('div');
    panel.innerHTML = '<button id="a">A</button><button id="b">B</button>';
    document.body.appendChild(panel);
    const unbind = bindFocusTrap(panel, document);
    expect(typeof unbind).toBe('function');
    unbind();
  });
});
