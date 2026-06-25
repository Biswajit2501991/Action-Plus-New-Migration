import type { Page, Locator } from '@playwright/test';

export class BasePage {
  constructor(protected readonly page: Page) {}

  async waitForAppReady() {
    await this.page.waitForLoadState('networkidle');
    await this.page.locator('#root').waitFor({ state: 'visible', timeout: 30_000 });
  }

  sidebarTab(name: string): Locator {
    return this.page.getByRole('navigation').getByRole('button', { name, exact: true });
  }

  async openTab(tabName: string) {
    await this.sidebarTab(tabName).first().click();
  }
}
