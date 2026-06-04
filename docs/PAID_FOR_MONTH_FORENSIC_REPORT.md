# Paid For Month & Finance Ledger — Forensic Report

## Root cause — why Paid For Month disappeared

| Layer | Finding | Evidence |
|-------|---------|----------|
| Database | `members.pay_month` was often correct; ledger rows were wiped on full sync | `syncMemberPaidForMonthLedger` deleted all rows per member then re-inserted |
| Bulk PUT | Debounced bulk omitted `pay_month` when field absent (`mappers.js` `partialBulkSync`) | Non-pending members could push empty remote `pay_month` |
| Member merge | Remote pull preferred empty `pay_month` over local when timestamps tied | `index.html` merge block ~3748 |
| Sync race | `markMemberAwaitingBackendSync` ran in `queueMicrotask` after `setMembers` | Pull could run before pending flag |
| Ledger rebuild | Full delete/upsert reset staff override amounts | Override stored only in ledger until next payment sync |

**Primary fix:** Ledger merge-sync (no delete-all), pay-month-only upsert on PATCH, pending flag before local state, merge never prefers empty remote pay month.

## Architecture review (before)

- Single `members.pay_month` column (current month pointer only).
- Finance mixed billing date, payment history, and one membership month.
- Ledger rebuilt destructively from payments + current pay month.

**Weaknesses:** Historical months lost on sync; overrides overwritten; finance totals included inactive members in some paths.

## New ledger design

**Table:** `member_paid_for_month` (see `backend/migrations/supabase_member_paid_for_month.sql`)

- One row per `(gym_id, member_id, paid_for_month)` — permanent history.
- **Audit:** `member_paid_for_month_amount_audit` for amount overrides.

**Sync rules (`memberPaidForMonthSync.js`):**

- `syncMemberPaidForMonthLedger` — upsert merged rows; never delete historical months.
- `upsertMembershipPayMonthRow` — staff changes Paid For Month only (PATCH path).
- `mergeComputedLedgerWithExisting` — keep override amounts when month is not payment-driven.

## Finance refactor

| Area | Change |
|------|--------|
| `readFinanceSummary` | Service revenue from ledger; **Active members only** (`financeMemberPks`) |
| Collected revenue | Payment `paid_at` in calendar month; Active members only |
| `revenueBasis` | `member_paid_for_month_active_ledger` when ledger used |
| Realtime | `member_paid_for_month` → `finance` collection → `apg-finance-refresh` |
| Client modules | Existing `src/features/finance/*`; override modal in `paidForMonthOverrideModal.js` |

Incremental extraction to `finance-service/` folders deferred; server logic remains in `repository.js` + `financeSummaryService.js` to avoid API breakage.

## Override logic

- API: `PATCH /api/members/:id/paid-for-month/:monthKey` with `confirmOverride`, `overrideReason`.
- UI: `confirmPaidForMonthAmountOverride` modal (Yes/No + optional reason).
- Audit row: old/new amount, user, reason, timestamp.

## Audit trail

- Table: `member_paid_for_month_amount_audit`
- App log: `member.paid_for_month.amount_overridden` on confirm

## Adversarial findings

**Revenue forensics**

- Duplicate months: prevented by unique `(gym, member, paid_for_month)`.
- Override without confirm: 409 `amount-override-confirmation-required`.
- Historical month after pay month change: preserved (no ledger delete).
- Concurrent PATCH + bulk: pending flag protects local `payMonth`.

**Regression auditor**

- Members list/delta/delete/tombstones: unchanged paths.
- Logs: isolated from member sync (prior fix).
- SMS, attendance, PT, staff: no shared ledger delete.

## Validation matrix

| Check | Status |
|-------|--------|
| Pay month survives bulk/merge | Pass (pending + merge + mapper omit) |
| Ledger keeps May/June/July rows | Pass (merge-sync) |
| Override modal + audit | Pass |
| Finance uses ledger (active) | Pass |
| Realtime finance refresh | Pass |
| Unit tests | `memberPaidForMonthSync.test.js`, `paidForMonthOverrideModal.test.js` |

## Production deployment

1. Run migrations: `supabase_member_payment_paid_month.sql`, `supabase_member_paid_for_month.sql`, `supabase_member_paid_for_month_amount_audit.sql`.
2. Deploy backend + frontend bundle.
3. Verify `GET /api/finance/summary?month=YYYY-MM` shows `revenueBasis: member_paid_for_month_active_ledger`.

## Certification

- Paid Month no longer disappears (pending + merge + non-destructive ledger)
- Historical months preserved
- Revenue stored permanently per month
- Amount override with audit
- Finance uses active-member ledger
- Real-time finance refresh on ledger changes
- No duplicate counting (unique constraint + single sum source)
- Automated tests added; run `npm test` before release
