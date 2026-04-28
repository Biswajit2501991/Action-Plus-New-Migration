# Phase 1.1 - Modularization Baseline

This phase introduces reusable modules in `src/` while keeping the existing `index.html` runtime stable.

## Added modules

- `src/features/members/validation.js`
  - Phone/email validators
  - DOB validation + age helper
  - Duplicate checks for phone/email/member ID

- `src/features/members/selectors.js`
  - Advanced member filters
  - Grouping by status
  - Pagination and virtual slice helpers

- `src/features/messaging/engine.js`
  - Template rendering with variables
  - WhatsApp URL generation
  - Message history append helper

- `src/features/forms/addMemberDraft.js`
  - Draft load/save/clear helpers for Add Member flow

## Why this approach

The current production UI runs from `index.html` with Babel-in-browser. Directly rewriting everything into modules in one step is risky.
This phase creates a migration-safe backbone so logic can be moved feature-by-feature with minimal breakage.

## Next extraction targets (Phase 1.2)

1. `AddMemberWizard` -> component module + draft integration
2. `EditMemberModal` -> validation module integration
3. `WhatsAppSmsPage` -> messaging engine integration
4. Member list/table rendering -> selectors + virtualization helpers

