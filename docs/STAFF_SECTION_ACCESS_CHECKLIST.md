# Staff section access checklist

**Rule:** Every new Gym Manager **web section** (sidebar page / module) must be added to **Staff → Web view — sections & access** before it ships. Do not ship a nav item that every staff member can open by accident.

**Canonical files (keep in sync):**

| Layer | File |
| ----- | ---- |
| Frontend (source of truth for UI picker) | `frontend/src/lib/domain/permissions.ts` |
| Frontend types | `frontend/src/types/index.ts` → `AccessMap` |
| Staff picker UI | `frontend/src/features/staff/staff-sections-access.tsx` (reads `SECTION_ACCESS_CONFIG`) |
| Nav | `frontend/src/lib/nav.ts` |
| Backend normalize + Access helpers | `backend/src/auth/accessControl.js` |
| Legacy shared (login / backend imports) | `src/features/access/permissions.js` |
| API routes | `backend/src/routes/<feature>.js` via `requireAccess(Access.*)` |

Related: [UPLIFTMENT_SAFE_CHANGE_GUIDE.md](./UPLIFTMENT_SAFE_CHANGE_GUIDE.md)

---

## Default policy for new sections

Prefer **opt-in** (same as **Website** / **Analytics**):

- Missing key in `access_json` → **denied**
- Owner must check the section (and child) under Staff access
- Safer when the page shows sensitive aggregates or admin tools

Use **opt-out** (`!== false`) only when the section is broadly needed day-to-day and historically default-on (e.g. Members, Finance cards). Prefer opt-in for anything new.

**Never** do what Analytics used to do: auto-grant a section because the user has Members / Finance / Dashboard.

---

## Checklist — new web section `My Section`

Copy this into the PR / chat and tick each item.

### 1. Name and keys

- [ ] Section display name (exact string used everywhere), e.g. `"My Section"`
- [ ] Access group key on `AccessMap`, e.g. `mySection`
- [ ] At least one child permission, e.g. `viewMySection`
- [ ] Optional: mobile More key, e.g. `moreMySection`

### 2. Frontend permissions (`frontend/src/lib/domain/permissions.ts`)

- [ ] Add `"My Section"` to `ALL_SECTIONS`
- [ ] Add `MY_SECTION_CHILD_PERMISSIONS` (label human-readable for the Staff UI)
- [ ] Add row to `SECTION_ACCESS_CONFIG` (this is what makes it appear in **Web view — sections & access**)
- [ ] Add group to `DEFAULT_ACCESS` (usually `viewMySection: true` so Select All / role presets that include the section grant the child)
- [ ] Add group to `normalizeAccess` — **opt-in:** `=== true` / **opt-out:** `!== false`
- [ ] If opt-in: add special cases in `isAccessChildEnabled` and `hasAccess` (same pattern as `website` / `analytics`)
- [ ] Add deny branch in `toggleAllSectionsAccess` when clearing all (`viewMySection: false`)
- [ ] Update `canAccessSection` — require `sections.includes("My Section")` + `hasAccess(..., "viewMySection")`. **Do not** add always-listed bypasses
- [ ] If role templates should include it: `DEFAULT_ROLE_TEMPLATES` / `sectionsWithRoleDefaults`
- [ ] If mobile More entry exists: `MOBILE_MORE_PERMISSIONS`, `MOBILE_PATH_ACCESS`, and gate `canAccessMobilePath` with `canAccessSection` when the page is sensitive

### 3. Types

- [ ] `frontend/src/types/index.ts` — add `mySection?: Record<string, boolean>` on `AccessMap`

### 4. Nav + page guard

- [ ] `frontend/src/lib/nav.ts` — `section: "My Section"` on the nav item; include in `SECTION_ORDER` if needed
- [ ] Page component — early deny UI with `canAccessSection(user, "My Section")` (and disable data queries when denied)
- [ ] Do not rely on nav alone; deep links must still be blocked

### 5. Backend (required for real security)

- [ ] `backend/src/auth/accessControl.js` — same keys in `normalizeAccess` + `Access.mySectionRead` (or write) helper
- [ ] Route(s) use `requireAccess(Access.mySectionRead)` — **not** “any authenticated staff” and **not** “has Members”
- [ ] `src/features/access/permissions.js` — mirror `ALL_SECTIONS`, `DEFAULT_ACCESS`, `normalizeAccess` (backend login path imports this)

### 6. No data loss / no surprise lockouts

- [ ] Existing staff who already had this section name in `staff_user_sections` should keep access if you are locking down a page that used to be open — use a soft-preserve only when the key was **never** set (see `normalizeAccessForStaff` / Analytics). Do **not** soft-preserve when the owner already set `false`
- [ ] Owner / `master_owner` always allowed
- [ ] Saving Staff access still writes `sections` + `access_json` together (parent checkbox drives children via `toggleAccessParent`)

### 7. Smoke test

- [ ] Owner: sees section, can open page, API 200
- [ ] Staff **without** grant: no sidebar item, page shows no-permission, API 403
- [ ] Staff **with** grant: sidebar + page + API OK
- [ ] Staff editor: section appears under **Web view — sections & access**; Expand Access shows child toggles
- [ ] Mobile (if applicable): More link respects the same grant

---

## Minimal code sketch (opt-in section)

```ts
// permissions.ts
export const MY_SECTION_CHILD_PERMISSIONS = [
  { key: "viewMySection", label: "View My Section" },
];

// SECTION_ACCESS_CONFIG
{ section: "My Section", accessGroup: "mySection", children: MY_SECTION_CHILD_PERMISSIONS },

// normalizeAccess
mySection: {
  viewMySection: a.mySection?.viewMySection === true,
},

// canAccessSection
if (section === "My Section") {
  return sections.includes("My Section") && hasAccess(user, "mySection", "viewMySection");
}
```

```js
// accessControl.js
Access.mySectionRead = (a) => a.__owner || a.mySection?.viewMySection === true;

// routes
app.get("/api/my-section/...", requireAccess(Access.mySectionRead), handler);
```

---

## Anti-patterns (do not ship)

| Anti-pattern | Why it hurts |
| ------------ | ------------ |
| Nav item without `SECTION_ACCESS_CONFIG` row | Owner cannot control who sees it |
| `canAccessSection` always-true for the new name | Same as no access control |
| API open to any logged-in staff | UI hide ≠ security |
| Granting via “has Members / Finance / Dashboard” | Over-exposes sensitive pages |
| Updating only `frontend/…/permissions.ts` | Backend / legacy diverge; login normalize drifts |
| Opt-out (`!== false`) for a brand-new sensitive page | Entire gym sees it until someone turns it off |

---

## When you finish

1. Commit frontend + backend + legacy `src/features/access/permissions.js` together.
2. Deploy **API** and **frontend** (access checks live on both).
3. Tell the owner: grant the section under Staff → Web view — sections & access for anyone who needs it.
