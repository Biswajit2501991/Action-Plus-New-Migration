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
    return this.page.getByTestId('staff-editor-modal');
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
      let optionValues: string[] = [];
      for (let i = 0; i < 30; i += 1) {
        optionValues = await gymCodeSelect.locator('option').evaluateAll((opts) =>
          opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v && v !== ''),
        );
        if (optionValues.length) break;
        // Multi-branch owner mode: default-branch select stays empty until at
        // least one assigned-branch checkbox is checked.
        const branchList = modal.getByTestId('staff-assigned-branches');
        if (await branchList.isVisible().catch(() => false)) {
          const branchBoxes = branchList.getByRole('checkbox');
          if (await branchBoxes.first().isVisible().catch(() => false)) {
            const checkedStates = await branchBoxes.evaluateAll((nodes) =>
              nodes.map((node) => Boolean((node as HTMLInputElement).checked)),
            );
            if (!checkedStates.some(Boolean)) {
              await branchBoxes.first().check();
            }
          }
        }
        await this.page.waitForTimeout(500);
      }
      if (optionValues.length) {
        await gymCodeSelect.selectOption(optionValues[0]);
      }
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
