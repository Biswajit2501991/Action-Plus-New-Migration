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
    // Phase 2 multi-tenant: a gym code is required for non-owner staff. Pick the first real branch.
    const gymCodeSelect = modal.getByTestId('staff-gym-code-select');
    if (await gymCodeSelect.isVisible().catch(() => false)) {
      // Wait until /api/gym-codes hydrate populates real options (more than the placeholder).
      await this.page.waitForFunction(
        () => {
          const sel = document.querySelector('[data-testid="staff-gym-code-select"]') as HTMLSelectElement | null;
          if (!sel) return false;
          return Array.from(sel.options).filter((o) => o.value && o.value !== '').length > 0;
        },
        undefined,
        { timeout: 15_000 },
      );
      const optionValues = await gymCodeSelect.locator('option').evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v && v !== ''),
      );
      await gymCodeSelect.selectOption(optionValues[0]);
    }
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
