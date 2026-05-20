import type { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export type StaffFormInput = {
  username: string;
  password: string;
  name: string;
  email: string;
  sections?: string[];
};

export class StaffManagementPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  get heading() {
    return this.page.getByRole('heading', { name: 'Staff Management' });
  }

  get addStaffButton() {
    return this.page.getByRole('button', { name: 'Add Staff' });
  }

  get modal() {
    return this.page.locator('.apg-modal-backdrop');
  }

  async open() {
    await this.openTab('Staff');
    await this.heading.waitFor();
  }

  async openAddModal() {
    await this.addStaffButton.click();
    await this.modal.getByRole('heading', { name: 'Add Staff' }).waitFor();
  }

  async fillForm(input: StaffFormInput) {
    const modal = this.modal;
    await modal.getByText('Username', { exact: true }).locator('..').locator('input').fill(input.username);
    await modal.getByText('Password', { exact: true }).locator('..').locator('input').fill(input.password);
    await modal.getByText('Name', { exact: true }).locator('..').locator('input').fill(input.name);
    await modal.getByText('Email', { exact: true }).locator('..').locator('input').fill(input.email);
    if (input.sections?.length) {
      for (const section of input.sections) {
        const cb = modal.getByRole('checkbox', { name: section });
        if (await cb.isVisible().catch(() => false)) {
          await cb.check();
        }
      }
    } else {
      await modal.getByRole('checkbox', { name: 'All' }).check();
    }
  }

  async save() {
    await this.modal.getByRole('button', { name: 'Save', exact: true }).click();
    await this.modal.waitFor({ state: 'hidden', timeout: 30_000 });
  }

  staffRow(username: string) {
    return this.page.getByRole('row').filter({ hasText: username });
  }
}
