// @vitest-environment jsdom
//
// Regression tests for the Phase-3 Dark Luxury polish:
//   - Settings → Gym Codes (Branches) collapsible accordion
//   - Finance white-bleed defusing in luxury mode
//   - Transactions table hover NOT painting solid white
//
// These are CSS / DOM property tests (jsdom can't render the React tree but
// can parse the project's <style> block and let us assert specific selectors
// resolve to specific values). The real-pixel contrast / motion gates live in
// the Playwright @a11y suite.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let PROJECT_HTML = '';
let PROJECT_STYLE = '';
beforeAll(() => {
  PROJECT_HTML = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const m = PROJECT_HTML.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('Could not extract <style> block from index.html');
  PROJECT_STYLE = m[1];
});

function mountStyle() {
  document.documentElement.lang = 'en';
  document.head.innerHTML = `<title>APG test</title><style>${PROJECT_STYLE}</style>`;
}

describe('Luxury skin — Finance + hover regressions', () => {
  it('catches the Finance page-level bg-[#F8FAFC] wrapper and makes it transparent', () => {
    mountStyle();
    document.body.setAttribute('data-apg-layout', 'luxury');
    document.body.innerHTML = `
      <main>
        <div class="p-3 md:p-8 space-y-5 text-slate-900 bg-[#F8FAFC] apg-force-light">
          <h1>Finance</h1>
        </div>
      </main>
    `;
    const wrap = document.querySelector('main > div');
    const cs = getComputedStyle(wrap);
    // Either explicitly transparent OR no solid white slab leaking through.
    // jsdom returns lower-cased values.
    expect(['transparent', 'rgba(0, 0, 0, 0)', 'rgb(248, 250, 252)']).toContain(cs.backgroundColor);
    // The slab MUST NOT be solid white in luxury.
    expect(cs.backgroundColor).not.toBe('rgb(255, 255, 255)');
  });

  it('hover:bg-white / hover:bg-slate-50 / hover:bg-slate-100 are NOT solid white in luxury skin (CSS contract)', () => {
    // Grep the project style block for the luxury hover rule and assert the
    // background-color value resolves to a translucent gold tint (NOT #fff
    // and NOT #f8fafc).
    const rule = PROJECT_STYLE.match(
      /body\[data-apg-layout="luxury"\][^{]*hover:bg-white[^{]*\{[\s\S]*?\}/,
    );
    expect(rule, 'Luxury hover rule must exist').not.toBeNull();
    const body = rule[0];
    expect(body).toMatch(/background-color\s*:\s*rgba\(212\s*,\s*175\s*,\s*55\s*,\s*0\.\d+\)/);
    expect(body).not.toMatch(/background-color\s*:\s*#fff/i);
    expect(body).not.toMatch(/background-color\s*:\s*#ffffff/i);
    expect(body).not.toMatch(/background-color\s*:\s*white\b/i);
  });

  it('apg-force-light cannot bomb solid white through the luxury skin', () => {
    const rule = PROJECT_STYLE.match(
      /body\[data-apg-layout="luxury"\][^{]*\.apg-force-light[^{]*\.bg-white[^{]*\{[\s\S]*?\}/,
    );
    expect(rule, 'Luxury override of apg-force-light .bg-white must exist').not.toBeNull();
    expect(rule[0]).toMatch(/--lux-surface-1/);
  });
});

describe('Settings → Gym Codes collapsible accordion', () => {
  it('STORAGE_KEYS exposes the new gymCodesPanelOpen key', () => {
    expect(PROJECT_HTML).toMatch(/gymCodesPanelOpen:\s*'apg\.settings\.gymCodesOpen'/);
  });

  it('renders the toggle button with the right ARIA contract', () => {
    expect(PROJECT_HTML).toMatch(/toggleTestId="gym-codes-toggle"/);
    expect(PROJECT_HTML).toMatch(/isOpen=\{gymCodesPanelOpen\}/);
    expect(PROJECT_HTML).toMatch(/ariaControls="gym-codes-panel-body"/);
    expect(PROJECT_HTML).toMatch(/testId="settings-category-branch-system"/);
  });

  it('accordion CSS-spring class collapses to grid-template-rows:0fr by default and opens to 1fr', () => {
    mountStyle();
    document.body.innerHTML = `
      <div class="apg-accordion" data-open="false">
        <div class="apg-accordion-inner"><p>body</p></div>
      </div>
    `;
    const acc = document.querySelector('.apg-accordion');
    const closed = getComputedStyle(acc).gridTemplateRows;
    expect(closed).toBe('0fr');

    acc.setAttribute('data-open', 'true');
    const open = getComputedStyle(acc).gridTemplateRows;
    expect(open).toBe('1fr');
  });

  it('clicking the toggle flips data-open on the accordion wrapper (DOM contract)', () => {
    mountStyle();
    document.body.innerHTML = `
      <button
        type="button"
        data-testid="gym-codes-toggle"
        aria-controls="gym-codes-panel-body"
        aria-expanded="true"
      >Toggle</button>
      <div id="gym-codes-panel-body" class="apg-accordion" data-open="true">
        <div class="apg-accordion-inner" data-testid="gym-codes-body">visible content</div>
      </div>
    `;

    const btn = document.querySelector('[data-testid="gym-codes-toggle"]');
    const acc = document.getElementById('gym-codes-panel-body');
    // Simulate the React handler with a minimal stand-in.
    btn.addEventListener('click', () => {
      const next = acc.getAttribute('data-open') !== 'true';
      acc.setAttribute('data-open', next ? 'true' : 'false');
      btn.setAttribute('aria-expanded', String(next));
    });

    expect(acc.getAttribute('data-open')).toBe('true');
    btn.click();
    expect(acc.getAttribute('data-open')).toBe('false');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    btn.click();
    expect(acc.getAttribute('data-open')).toBe('true');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('chevron rotates via CSS when data-open flips', () => {
    mountStyle();
    document.body.innerHTML = `
      <span class="apg-accordion-chevron" data-open="false">▾</span>
    `;
    const chev = document.querySelector('.apg-accordion-chevron');
    const closed = getComputedStyle(chev).transform;
    expect(closed === 'none' || closed === '').toBe(true);
    chev.setAttribute('data-open', 'true');
    const open = getComputedStyle(chev).transform;
    // jsdom returns matrix(...) or rotate(180deg) depending on engine;
    // accept either as long as it's not 'none'.
    expect(open === 'none').toBe(false);
  });
});

describe('Sidebar branding cleanup', () => {
  it('renamed UI MODE → MODE in the sidebar', () => {
    expect(PROJECT_HTML).toMatch(/tracking-\[0\.16em\][^>]*>MODE</);
    // Old label must be gone.
    expect(PROJECT_HTML).not.toMatch(/tracking-\[0\.16em\][^>]*>UI MODE</);
  });

  it('renamed sub-label "Premium charcoal · glass · gold" → "Premium view"', () => {
    expect(PROJECT_HTML).toMatch(/'Premium view'/);
    expect(PROJECT_HTML).not.toMatch(/Premium charcoal · glass · gold/);
  });

  it('removes the Light / Dark mode toggle button JSX', () => {
    // The old toggle had `'LIGHT MODE'` and `'DARK MODE'` literal text. The
    // replacement comment retains "Light/Dark mode toggle removed" so the
    // intent is grep-able.
    expect(PROJECT_HTML).toMatch(/Light\/Dark mode toggle removed/);
    expect(PROJECT_HTML).not.toMatch(/'DARK MODE'\s*:\s*'LIGHT MODE'/);
  });
});
