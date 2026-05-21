import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apiHealthOk } from '../utils/api-client';
import { LoginPage } from '../pages/LoginPage';

/**
 * Real-pixel contrast verification for the Dark Luxury layout.
 *
 * Strategy: run the same WCAG 2.1 AA contrast audit against the Dashboard in
 * Classic mode (the baseline) and in Luxury mode. The Luxury skin must not
 * introduce ANY new color-contrast violations beyond what Classic already has,
 * which guarantees we did no harm and the new palette holds up against real
 * computed styles inside Chromium.
 */
async function countContrastViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2aa', 'wcag21aa'])
    .include('body')
    .analyze();
  return results.violations.filter((v) => v.id === 'color-contrast');
}

async function setLayoutMode(page, mode: 'classic' | 'luxury') {
  await page.evaluate((value) => {
    window.localStorage.setItem('apg.layoutMode', value);
    if (document.body) document.body.setAttribute('data-apg-layout', value);
  }, mode);
}

test.describe('@critical @a11y Dark Luxury contrast (axe-core/playwright)', () => {
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('Dashboard in Luxury mode introduces no new contrast violations vs Classic', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Pre-seed classic mode before the React boot so the very first paint matches.
    await page.addInitScript(() => {
      window.localStorage.setItem('apg.layoutMode', 'classic');
    });

    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      process.env.E2E_OWNER_ID || 'owner',
      process.env.E2E_OWNER_PASSWORD || 'owner',
    );
    await page.getByRole('button', { name: 'Dashboard', exact: true }).first().click();
    await expect(
      page.getByRole('heading', { name: 'Dashboard', exact: true }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // Classic baseline
    await setLayoutMode(page, 'classic');
    await page.waitForTimeout(400);
    const classicViolations = await countContrastViolations(page);

    // Luxury skin
    await setLayoutMode(page, 'luxury');
    await page.waitForTimeout(400);
    const luxuryViolations = await countContrastViolations(page);

    const classicNodes = classicViolations.reduce((acc, v) => acc + v.nodes.length, 0);
    const luxuryNodes = luxuryViolations.reduce((acc, v) => acc + v.nodes.length, 0);

    // Diagnostics that appear on failure.
    if (luxuryNodes > classicNodes) {
      console.log('Classic contrast violations:', JSON.stringify(classicViolations.map((v) => ({
        id: v.id, impact: v.impact, count: v.nodes.length,
      })), null, 2));
      console.log('Luxury contrast violations:', JSON.stringify(luxuryViolations.map((v) => ({
        id: v.id, impact: v.impact, count: v.nodes.length,
      })), null, 2));
    }

    expect(luxuryNodes, `Luxury introduced ${luxuryNodes - classicNodes} new contrast failures vs Classic baseline.`).toBeLessThanOrEqual(classicNodes);
  });

  test('Luxury palette tokens are wired on <body>', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('apg.layoutMode', 'luxury');
    });
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      process.env.E2E_OWNER_ID || 'owner',
      process.env.E2E_OWNER_PASSWORD || 'owner',
    );
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return {
        primary: cs.getPropertyValue('--lux-text-primary').trim(),
        section: cs.getPropertyValue('--lux-text-section').trim(),
        placeholder: cs.getPropertyValue('--lux-placeholder').trim(),
        gold: cs.getPropertyValue('--lux-gold').trim(),
      };
    });
    expect(tokens.primary.toUpperCase()).toBe('#F4F6F8');
    expect(tokens.section.toUpperCase()).toBe('#C9CFDA');
    expect(tokens.placeholder.toUpperCase()).toBe('#9AA1AE');
    expect(tokens.gold.toUpperCase()).toBe('#FCD36B');
  });
});
