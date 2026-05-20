# QA Auto-Loop Prompt (Action Plus Gym)

Paste this prompt at the **end of any implementation request** to make the AI
run the full QA cycle, root-cause failures, fix them, and loop until everything
passes.

---

## The Prompt

> After you finish the implementation above, run the **full QA verification
> loop** below. Do **not** stop or report success until every gate passes.
>
> ### Loop (repeat until all gates green)
>
> 1. **Static gate**
>    - Run `npm test` (Vitest).
>    - Run `cd backend && node --check src/server.js` to catch syntax errors.
>    - Read lints on every file you edited; fix any new warning/error you
>      introduced.
> 2. **Backend gate**
>    - Restart backend via the supervisor:
>      `curl -fsS -X POST http://127.0.0.1:4010/backend/restart`
>    - Verify health:
>      `curl -fsS http://127.0.0.1:4000/api/health` returns
>      `"ok":true` and `"dataBackend":"supabase"`.
> 3. **E2E gate**
>    - Ensure `tests/e2e/report/` is wiped.
>    - Run `npx playwright install chromium --with-deps` if Playwright
>      browsers are missing.
>    - Run **smoke first**: `npm run test:e2e:smoke`.
>    - If smoke passes, run **critical**: `npm run test:e2e:critical`.
>    - If critical passes, run **full**: `npm run test:e2e`.
> 4. **Regression gate** (apply `docs/QA_REGRESSION_GATE.md`)
>    - Owner login shows ≥ 8 sidebar sections.
>    - `PUT /api/users/bulk` and `PUT /api/members/bulk` are **upsert-only**
>      (no deletes by absence) — confirm by reading
>      `backend/src/db/supabase/repository.js`.
>    - Empty `members` array is **not** pushed by background sync
>      (`index.html` debounced effect).
> 5. **On any failure**, do this — do not skip steps:
>    a. **Capture evidence**: the failing command output, the relevant
>       Playwright trace path under `tests/e2e/report/`, the offending file
>       and line numbers, the network response body (if HTTP), and the
>       stack trace.
>    b. **Form one hypothesis** for the root cause. State it explicitly,
>       mapped to a specific file/line, before changing anything.
>    c. **Trace it end-to-end** (frontend → API route → middleware →
>       Supabase repository → mappers → DB). Quote the lines you read.
>    d. **Fix the root cause**, not the symptom. Never `try/catch` to hide
>       it. Never weaken an assertion, soften a selector, increase a
>       timeout, or add `.skip` to make the test pass.
>    e. If the test itself is wrong, fix the **test code**, but explain why
>       and confirm the production code path is still correct.
>    f. Re-run the **failing test in isolation first** (`npx playwright
>       test <path> --grep <name>`); only then re-run full E2E.
>    g. Loop back to step 1.
> 6. **Stop condition** — all of the following must be true to declare
>    success:
>    - `npm test` exit 0.
>    - `npm run test:e2e` exit 0 (no `flaky`, no `skipped` for required
>      tests).
>    - No new lints.
>    - Backend `/api/health` 200 with `dataBackend: "supabase"`.
>    - `git status` shows only files you intended to change.
>    - Your final reply lists exact pass/fail counts and the trace report
>      path.
>
> ### Hard rules
>
> - Never declare done if any test failed, was skipped due to backend
>   unavailability **without** an explicit user opt-out, or was retried > 2
>   times in a row at the same step.
> - Never weaken tests: do not change `expect`, remove `await`, replace
>   `getByRole` with brittle CSS, or add `test.skip` to pass.
> - Never edit `node_modules` or vendor folders.
> - Never push to git.
> - Never modify `.env*` files.
> - If a fix touches Supabase schema, generate a migration under
>   `backend/migrations/` and stop the loop to ask the user to run it.
> - If you need new browser binaries, request permission once and proceed.
>
> ### When you genuinely cannot fix in-loop
>
> If after **3 attempts** at the same failing test the root cause is
> outside the codebase (e.g. Supabase row missing, env var not set on the
> machine, network blocked), stop the loop and produce:
>
> - The exact failing assertion.
> - The traced root cause with file/line references.
> - The smallest manual step the user must take.
> - A diff-style description of the fix you would apply once that step is
>   done.
>
> Then wait for the user.
>
> ### Final report format (always emit at the end)
>
> ```
> ## QA Verification Report
> - Unit:       <passed>/<total>   (vitest)
> - Smoke E2E:  <passed>/<total>   (playwright @smoke)
> - Critical:   <passed>/<total>   (playwright @critical)
> - Full E2E:   <passed>/<total>   (playwright)
> - Lints:      0 new
> - Backend:    healthy (supabase)
> - Loops run:  <n>
> - Root causes fixed:
>   1. <one-line description> → <file>:<line>
>   2. ...
> - Trace report: tests/e2e/report/index.html
> ```

---

## Short version (one-liner you can paste)

> After this change, run the QA Auto-Loop in `docs/QA_AUTO_LOOP_PROMPT.md`.
> Do not stop until `npm test`, `npm run test:e2e`, lints, and
> `/api/health` are all green. Root-cause every failure (no skips, no
> weakened assertions, no try/catch hides). Emit the final QA Verification
> Report.

---

## Exact commands the loop will run

```bash
# Workspace root
cd "/Users/biswajit/Desktop/Action Plus Gym Management App"

# 1. Unit
npm test

# 2. Backend
curl -fsS -X POST http://127.0.0.1:4010/backend/restart
curl -fsS http://127.0.0.1:4000/api/health

# 3. E2E (first run only)
npx playwright install chromium --with-deps

npm run test:e2e:smoke
npm run test:e2e:critical
npm run test:e2e
npm run test:e2e:report   # open HTML on failure

# Re-run one failing test
npx playwright test tests/e2e/critical/staff-create.spec.ts --grep "owner adds staff"
```

## Required env for E2E

Set these once (e.g. in your shell profile) so the loop has owner creds:

```bash
export E2E_BASE_URL=http://127.0.0.1:5501
export E2E_API_URL=http://127.0.0.1:4000
export E2E_OWNER_ID=owner
export E2E_OWNER_PASSWORD=<your owner password>
# Optional for the authorization test:
export E2E_RECEPTION_ID=reception
export E2E_RECEPTION_PASSWORD=<reception password>
```

If `E2E_OWNER_PASSWORD` is not set, the auth fixture will throw — that is
intentional, the loop should not silently skip critical tests.
