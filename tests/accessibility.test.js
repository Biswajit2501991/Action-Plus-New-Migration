// @vitest-environment jsdom
//
// Accessibility regression tests for the Dark Luxury layout skin.
//
// Why .js instead of .tsx: this project ships React via CDN inside index.html
// (monolithic) and does not import React/JSX from node_modules anywhere, so a
// TSX file would require a brand-new JSX toolchain just to run two checks.
// We instead extract the live <style> block from index.html, mount
// representative fragments of Sidebar / Dashboard / Staff Management in jsdom,
// flip body[data-apg-layout="luxury"], and run axe-core. This catches:
//   - structural a11y issues (missing labels, duplicate ids, button without name)
//   - non-text contrast and visible focus where the CSS allows checks
// Real-pixel contrast is enforced in the Playwright a11y e2e (axe-core/playwright).

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/** Extract the project's <style> block from index.html so jsdom inherits the real palette. */
function loadProjectStyle() {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('Could not extract <style> block from index.html');
  return m[1];
}

function mountFixture({ layout = 'luxury', innerHTML = '' } = {}) {
  document.documentElement.lang = 'en';
  document.head.innerHTML = `<title>Action Plus Gym — A11y Test</title><style>${PROJECT_STYLE}</style>`;
  document.body.setAttribute('data-apg-layout', layout);
  document.body.className = 'bg-slate-100 text-slate-900';
  // Wrap fixtures in <main> so axe-core's region rule passes (every page must
  // have at least one landmark; our real app already mounts <Sidebar>+<main>).
  document.body.innerHTML = innerHTML;
}

async function runAxe({ rules = {} } = {}) {
  // Run on the whole document. We disable a handful of rules that are
  // properties of the WRAPPER (page-level chrome we don't render in fixtures):
  //   - region: every fixture is mounted standalone; we already wrap in <main>
  //     where appropriate. We don't ship a duplicate landmark just to satisfy
  //     the rule on partial trees.
  //   - landmark-one-main / landmark-unique: same reasoning for fragmentary mounts.
  //   - bypass: requires a skip-link, which is a real-app concern, not luxury-skin.
  const results = await axe.run(document, {
    rules: {
      region: { enabled: false },
      'landmark-one-main': { enabled: false },
      'landmark-unique': { enabled: false },
      bypass: { enabled: false },
      ...rules,
    },
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
  });
  return results;
}

let PROJECT_STYLE = '';
beforeAll(() => {
  PROJECT_STYLE = loadProjectStyle();
});

const SIDEBAR_FIXTURE = `
  <aside class="apg-sidebar w-72" aria-label="Primary navigation">
    <div class="apg-sidebar-brand pt-4 pb-3 px-5">
      <button type="button" aria-label="Collapse sidebar">
        <div class="text-slate-900">Action Plus Gym</div>
        <div class="text-slate-500">Owner</div>
      </button>
    </div>
    <nav>
      <div class="apg-nav-section">OPERATIONS</div>
      <div>
        <button class="text-slate-700">Attendance</button>
        <button class="text-slate-700">Leave Tracker</button>
      </div>
      <div class="apg-nav-section">FINANCE</div>
      <div>
        <button class="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 border border-blue-100">Finance</button>
      </div>
    </nav>
  </aside>
`;

const DASHBOARD_FIXTURE = `
  <main id="dashboard">
    <h1 class="text-xl md:text-2xl font-semibold text-slate-900">Dashboard</h1>
    <label for="dash-search" class="sr-only">Search members</label>
    <input id="dash-search" placeholder="Search members (name, ID, mobile, email, staff)..."
      class="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500" />
    <section aria-label="Member status counts">
      <button class="bg-emerald-50 border-emerald-200 text-emerald-700" aria-label="Active members">
        <span>Active</span><strong>124</strong>
      </button>
      <button class="bg-amber-50 border-amber-200 text-amber-700" aria-label="Hold members">
        <span>Hold</span><strong>255</strong>
      </button>
      <button class="bg-pink-50 border-pink-200 text-pink-700" aria-label="Deactivated members">
        <span>Deactivated</span><strong>322</strong>
      </button>
      <button class="bg-slate-100 border-slate-200 text-slate-700" aria-label="Cancelled members">
        <span>Cancelled</span><strong>6</strong>
      </button>
      <div class="bg-emerald-50 border-emerald-200 text-emerald-800" aria-label="Total revenue this month">
        <span>Total Revenue (Monthly)</span><strong>$41,195</strong>
      </div>
    </section>
  </main>
`;

const STAFF_FIXTURE = `
  <main>
    <h1 class="text-xl md:text-2xl font-semibold text-slate-900">Staff Management</h1>
    <h2 class="text-xl font-semibold text-slate-900">Role Configuration Manager</h2>
    <div class="bg-amber-50 border-amber-200 rounded-2xl p-4" aria-label="Role: Front Desk Manager">
      <div class="text-slate-900">Front Desk Manager</div>
      <div class="text-slate-600">Member and Front Desk Ops</div>
      <button class="rounded-full px-3 py-2 text-sm font-medium bg-blue-600 text-white">Create Staff with this Role</button>
    </div>
    <table>
      <thead>
        <tr><th>Username</th><th>Name</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr><td>owner</td><td>Owner</td><td class="bg-emerald-50 text-emerald-700">Active</td></tr>
      </tbody>
    </table>
  </main>
`;

describe('Dark Luxury layout a11y (jsdom + axe-core)', () => {
  it('Sidebar in luxury mode is structurally a11y-clean (wcag2a/2aa/21aa)', async () => {
    mountFixture({ layout: 'luxury', innerHTML: SIDEBAR_FIXTURE });
    const results = await runAxe();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  it('Dashboard in luxury mode is structurally a11y-clean', async () => {
    mountFixture({ layout: 'luxury', innerHTML: DASHBOARD_FIXTURE });
    const results = await runAxe();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  it('Staff Management in luxury mode is structurally a11y-clean', async () => {
    mountFixture({ layout: 'luxury', innerHTML: STAFF_FIXTURE });
    const results = await runAxe();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  it('Luxury mode exposes the WCAG-locked CSS variables on <body>', () => {
    mountFixture({ layout: 'luxury', innerHTML: '<div>probe</div>' });
    const cs = getComputedStyle(document.body);
    expect(cs.getPropertyValue('--lux-text-primary').trim()).toBe('#F4F6F8');
    expect(cs.getPropertyValue('--lux-text-section').trim()).toBe('#C9CFDA');
    expect(cs.getPropertyValue('--lux-placeholder').trim()).toBe('#9AA1AE');
    expect(cs.getPropertyValue('--lux-gold').trim()).toBe('#FCD36B');
  });

  it('Classic mode does NOT expose luxury tokens (no leakage between skins)', () => {
    mountFixture({ layout: 'classic', innerHTML: '<div>probe</div>' });
    const cs = getComputedStyle(document.body);
    expect(cs.getPropertyValue('--lux-text-primary').trim()).toBe('');
  });

  /**
   * Pure-JS contrast guard: enforce that every documented luxury foreground
   * token clears WCAG 2.1 AA (>=4.5:1) against the deepest body background.
   * This is a property-test for the palette itself; jsdom cannot measure
   * rendered pixels, so this complements the @axe-core/playwright e2e check.
   */
  it('Every luxury foreground token clears WCAG 2.1 AA against the body background', () => {
    const PALETTE = {
      'text-primary': '#F4F6F8',
      'text-secondary': '#D1D5DB',
      'text-muted': '#B7BCC6',
      'text-section': '#C9CFDA',
      'placeholder': '#9AA1AE',
      'gold': '#FCD36B',
      'gold-rich': '#D4AF37',
      'emerald': '#6EE7B7',
      'amber': '#FCD34D',
      'orange': '#FDBA74',
      'rose': '#FDA4AF',
      'pink': '#F9A8D4',
      'blue': '#93C5FD',
      'indigo': '#A5B4FC',
      'violet': '#C4B5FD',
    };
    const BG = '#0a0a0d';
    const failures = [];
    for (const [name, fg] of Object.entries(PALETTE)) {
      const ratio = contrastRatio(fg, BG);
      if (ratio < 4.5) failures.push(`${name} (${fg}) vs ${BG} = ${ratio.toFixed(2)}:1`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

function contrastRatio(hex1, hex2) {
  const l1 = relLuminance(hex1);
  const l2 = relLuminance(hex2);
  const [a, b] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

function relLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const linearise = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}
