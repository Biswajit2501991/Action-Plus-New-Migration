# READ THIS FIRST — Upliftment / Enhancement Safety Guide

**Purpose:** Any upliftment, redesign, analytics, portal change, or “improvement” must **not** break existing working functionality or cause data loss.

**Audience:** Humans and AI agents working on Gym Manager, Member Portal, or Website.

**Related:** [QA_REGRESSION_GATE.md](./QA_REGRESSION_GATE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [STAFF_SECTION_ACCESS_CHECKLIST.md](./STAFF_SECTION_ACCESS_CHECKLIST.md) (new sidebar sections must go in Staff access by default)

---

## Golden rule

> **Enhance by adding. Do not rewrite working paths to “make charts / UI nicer.”**  
> If a feature works today (members save, payments, portal login, WhatsApp, attendance, finance KPIs), your change must leave that path intact unless the user explicitly asks to change that path.

---

## Before you touch code

1. **Name the goal** in one sentence (e.g. “show Bill Date on portal as Next Payment Date”).
2. **List what must keep working** (at least: Members, Finance/payments, Portal auth, WhatsApp, Attendance, Logs).
3. **Prefer display / read-only changes** over schema or write-path changes.
4. **Never “fix” numbers by rewriting history** (payments, paid-for-month, audit logs, soft-deleted members).
5. **If unsure which field to show**, match Gym Manager labels:
   - **Bill / Billing Date** → `billing_date` / `billingDate`
   - **Next Payment Date** (internal derived, often +1 month) → `next_payment_date`
   - **Payment By** (grace, often +7 days) → `payment_by`
   - Member-facing “when do I pay?” → prefer **Bill Date**, not derived next-cycle date.

---

## Hard never-do list (data safety)

| Never do | Why |
| -------- | --- |
| Bulk rewrite `member_payment_history` / `member_paid_for_month` for reports | Breaks Finance / Dashboard totals |
| Clear or truncate `audit_logs` / `member_portal_audit_logs` | Loses history; analytics must be append-only readers |
| Hard-delete members for “cleanup” in upliftment | Soft-delete (`deleted_at`) only when product already does |
| Auto-convert visitors → members by writing conversion fields without an explicit product decision | Risk of wrong merges / data corruption |
| Change payment recording, member save, portal auth, or WhatsApp send “as a side effect” of UI work | Silent production breakage |
| Empty-array bulk PUT of members/users in production flows | Documented wipe risk — see QA gate |
| Force-push / hard-reset shared branches as part of a feature | Deploy / history risk |

---

## Safe change patterns (prefer these)

### 1. Display-only / mapping fixes
- Change what the UI **shows** (label + which field is read).
- Do **not** overwrite DB columns to match the label.
- Example: Member Portal “Next Payment Date” label → display `billing_date` (Bill Date). Stored `next_payment_date` stays unchanged.

### 2. Read-only analytics / reports
- `GET` only; filter `gym_id` + branch like Finance/Members.
- Reuse existing money semantics (`member_payment_history` for collected cash).
- Exclude soft-deleted members (`deleted_at IS NULL`) unless the panel is explicitly about deletes.
- Sparse data → show “Low data / feature not in use”, not fake zeros that look broken.

### 3. Additive features
- New route / tab / API next to existing ones.
- Feature flags or permission gates when risky.
- Do not replace a working screen with a half-migrated rewrite in the same PR.

### 4. Portal / Website
- Trust `portal_enabled` / status gates already agreed with Gym Manager.
- Do not reset portal access as a side effect of “normalize” helpers.
- Prefer client-derived alerts over writing alert rows unless product asks.

---

## Branch & permission safety

- Branch staff must **not** see other branches (same filters as Members/Finance).
- Owner / master-owner retains gym-wide read when no active branch is selected.
- New SYSTEM pages (e.g. Analytics) must reuse existing permission patterns — do not invent a write surface.

---

## Repos & deploy map

| Product | Typical repo | Live |
| ------- | ------------ | ---- |
| Gym Manager | Action-Plus-New-Migration → `migration/main` | app.gymactionplus.com |
| Website + Member Portal | Action-Plus-Gym-Website → `origin/main` | actionplusgym.com |

Do not mix commits across repos. Do not push Gym Manager fixes only to the unused test remote by mistake.

---

## Minimum verification before calling a change “done”

- [ ] Existing happy path still works for the area you touched (open the screen, save once if write-related, or login if portal).
- [ ] No new writes to members / payments / portal / audit unless the task explicitly required them.
- [ ] Numbers that claim to match Finance/Dashboard use the **same** field definitions.
- [ ] Branch-scoped user cannot see another branch’s rows (if auth/data touched).
- [ ] Soft-deleted members stay hidden from normal lists/KPIs.
- [ ] If display mapping changed: label and value agree (e.g. Bill Date value under “Next Payment Date” for members).

Run when behaviorally relevant:

- Backend/unit: existing `npm test` where available
- Manual: owner login + affected tab
- Portal: login → home → profile → one payment/attendance screen if those files changed

---

## Quick decision tree

```text
Is this only changing what users see (label / which field to read)?
  YES → Display-only fix. No DB write. Ship with UI verify.
  NO  → Does it need new columns or rewrite existing rows?
          Prefer optional new columns or read-only heuristics.
          Never auto-rewrite historical payments / audits / visitors
          without an explicit product go-ahead.
```

---

## When the user asks for “upliftment”

1. Read this file.
2. Read [QA_REGRESSION_GATE.md](./QA_REGRESSION_GATE.md).
3. Propose the **smallest** additive change that meets the goal.
4. Call out any write-path risk before implementing.
5. After implement: confirm zero unintended writes and no regression on listed critical paths.

---

*Last updated: July 2026 — created to protect live Gym Manager + Member Portal behavior during analytics and portal upliftments.*
