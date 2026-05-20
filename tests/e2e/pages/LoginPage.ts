import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  get usernameInput() {
    return this.page.getByPlaceholder('Enter your username');
  }

  get passwordInput() {
    return this.page.locator('input[placeholder="••••"]');
  }

  get submitButton() {
    return this.page.getByRole('button', { name: 'LOGIN' });
  }

  async goto() {
    await this.page.goto('/index.html');
    await this.waitForAppReady();
  }

  async login(identifier: string, password: string) {
    await this.usernameInput.fill(identifier);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.getByRole('heading', { name: 'Staff Management' }).or(
      this.page.getByRole('button', { name: 'Dashboard' }),
    ).first().waitFor({ timeout: 30_000 });
  }
}
