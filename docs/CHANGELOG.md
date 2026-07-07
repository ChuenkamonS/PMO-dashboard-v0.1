# CHANGELOG.md

## Format

### Phase X
#### Added
- ...

#### Changed
- ...

#### Fixed
- ...

#### Removed
- ...

#### Remaining Work
- ...

---

## Current Baseline

### 2026-07-07 Light UX Alignment Pass

Scope: presentation-only alignment across All Memos, Pending Approval, Budget & Spend, License
Management, and Device Management. No data, workflow, permission, routing, or calculation changes.
Implemented against `UI_CONSISTENCY.md`, `UX_ALIGNMENT_GUIDELINE.md`, `UX_COMPONENT_SPEC.md`,
`TABLE_GUIDELINE.md`, `UX_GUARDRAILS.md`, and `UAT_ACCEPTANCE.md`.

#### Changed
- Standardized toolbar, result-count, table-row, card, and modal-footer spacing across the five
  target modules using the existing layout classes and a small shared CSS layer.
- Reduced All Memos list density by keeping the primary workflow columns in the table; Approver,
  Created date, and Reject Reason remain available in the existing memo detail view.
- Removed redundant Pending Approval `View` buttons because every row already opens the same detail
  view; all role-based Approve, Reject, and Cancel actions remain unchanged and available.
- Moved License Memo Index actions into the toolbar's right-side action group and reduced its table
  to primary inventory columns; Owner, Department, Purchase Date, and Source remain in the existing
  license detail/edit surface.
- Moved Device Registry's secondary summary tables below the primary filter-and-table workflow.
- Aligned two-card Pending KPI sizing, modal footer separation, and Template-before-Import action
  order with the documented component and toolbar standards.

#### Tests
- `node --check views/history.js views/pending.js views/license.js`
- `node --test tests/*.test.js` — 567 passed, 0 failed.

#### Remaining Work
- Browser visual verification remains required at normal UAT desktop widths.

### 2026-07-06 UX Consistency Pass — Filters, Actions, Status, Empty States

Scope: UI polish only across All Memos/History, Pending Approval, Budget & Spend, License
Management, and Device Management — no calculations, memo lifecycle, approval logic, PO creation,
Mark Arrived logic, license assignment logic, budget logic, or schema/migrations touched.

#### Added
- **Visible filter labels**: `initMultiSelect()` (`app.js`) takes an optional third `fieldLabel`
  argument and renders it inside the multi-select trigger widget, so filters that previously showed
  only a bare "ทั้งหมด"/"All" placeholder now read e.g. "Type ▾ All types". Applied to every
  multi-select filter across Pending, All Memos/History, Budget & Spend (Actual Spend, Manual
  Entries, Forecast), License (Memo Index, Users, Other), and Device Management (Registry, Purchase
  Orders). Plain (non-multi-select) filters — Sort, Period, Year, Source, Frequency, Amount — got an
  inline `.filter-field`/`.filter-label` wrapper instead (new CSS in `index.html`'s embedded
  `<style>`, since `style.css` is not linked from `index.html` and has no effect on the rendered
  app).
- Missing `.badge-orange` CSS rule added to `index.html` (previously only existed in the unused
  `style.css`), fixing License's 15-day expiry warning badge and the Assignment Import "ambiguous"
  row badge, which were rendering unstyled.

#### Changed
- **Device Management action buttons**: the tab-bar-level "Export CSV"/"Export PO" buttons (visible
  on both the Registry and Purchase Orders tabs regardless of which was active) were removed;
  Registry already had its own scoped Export CSV button, and Purchase Orders now has its own scoped
  Export PO button in its filter row.
- **Pending Approval status pill** now reuses the shared `histStatusBadgeClass()`/`histStatusLabel()`
  helpers (already the single source of truth for All Memos/History) instead of a separately-styled
  purple pill, so a Pending memo reads the same amber badge in both places.
- **Device Purchase Order status badges** (`PO_STATUS_BADGE`, `poStatusBadgeHtml()`) refactored from
  hardcoded inline colors to the shared `.badge badge-*` classes (same colors, reused component).
- Empty-state messages in Device Registry, Purchase Orders, License (Memo Index, Summary,
  Reconciliation, Users, Other), and Budget & Spend (Overview, Actual Spend, Forecast, Budget vs
  Actual, Assignment Workspace, Budget Settings) standardized onto the shared `.hist-empty` class and
  a consistent "No X found. Try changing filters." / "No X found — do Y to add one." phrasing,
  replacing one-off inline styles and (in three Budget Pool empty states) decorative emoji.
- BvA's search input reordered to appear before its filters (search-first, matching every other
  filter row in the app).

#### Removed
- `exportDeviceCSV()` (`views/device.js`), a dead alias for `exportDeviceCsv()` with no remaining
  callers after the tab-bar button removal above.

#### Tests
- `tests/budget-expenses.test.js`: 3 assertions updated to match the new English Budget Pool
  Assignment Workspace empty-state copy (same behavior, text changed only).
- `node --check views/*.js tests/*.test.js` and `node --test tests/*.test.js` — 567 passed, 0 failed.

#### Remaining Work
- Manual browser verification was not performed this pass — the project folder had already reached
  the 5-dev-server-per-folder preview limit from other sessions, so a preview server could not be
  started. Static review (tag-balance check, full diff read, full test run) was done instead.
- Memo-level `cancelled`/`voided` badges were deliberately left neutral gray (`histStatusBadgeClass()`
  in `app.js`), not changed to red/negative as this task's Part 4 example copy suggested — there is
  an existing, tested regression test (`workflow.test.js`, "cover every known memo status unchanged")
  and an inline comment recording this as an intentional Milestone 1B decision (voided/cancelled/draft
  share one neutral tone, distinct from Rejected). Flagged here rather than silently overridden.
- Part 5 (search/filter/action row layout) found only one clear inconsistency (BvA's search-after-
  filters ordering, fixed above); other rows already followed search → filters → actions.

---

### 2026-07-06 Device Management — PO Filters and Cross-Module Navigation (Phase D2)

Scope: Device Management usability only, using existing data — no PO creation, Mark Arrived, memo
approval, budget, license, settings, resource, or schema/migration logic touched. Reused
`views/license.js`'s deep-link/context-banner pattern rather than inventing a new navigation system.

#### Added
- **Purchase Orders filters** (`views/device.js` `_filteredPOs()`, `index.html`): search by Memo
  No / Item Name, Status multi-select, Project multi-select, and a "Remaining > 0" toggle. Remaining
  Qty is computed live as `orderedQty - arrivedQty` and never persisted onto the PO record. Filters
  narrow the visible table rows, the export, and a new "Showing X of Y orders" visible-count label.
- **PO export respects filters**: `exportPurchaseOrdersCSV()` now exports `_filteredPOs(loadPurchaseOrders())`
  instead of the full unfiltered list (MASTER_SPEC.md "Export Rules"), matching the pattern already
  used by `exportDeviceCsv()`. Device Registry export is unchanged.
- **PO -> Device Registry drill-down**: a new "Devices" column in the Purchase Orders table shows the
  count of devices created from that PO (matched via `device.purchaseOrderId`, set by `markArrived()`).
  A non-zero count is a clickable link (`viewDevicesForPO()`) that switches to Device Registry filtered
  to just that PO's devices; zero renders as plain, non-clickable "0". The pre-existing "View devices"
  action button on a Fulfilled PO row now also scopes to that PO (previously jumped to an unfiltered
  Device Registry).
- **Device Registry deep-link filter + context banner**: `_devDeepLinkFilter` (module-level, never
  persisted) narrows `_filteredDevices()` on top of the existing search/type/status/project/company
  filters (AND, not OR). A new banner (`dev-registry-context-banner`) shows "Showing devices for:
  PO / Memo / Item" with "← Back to Purchase Orders" or "← Back to Memo" (depending on entry point)
  and "Clear filter".
- **Memo Detail -> PO / Device links** (`views/history.js`): `getLinkedPurchaseOrders()` (new, mirrors
  the existing but previously-unused `getLinkedDevices()`) and a shared `_memoLinkedRecordsButtonsHtml()`
  render "📦 View Purchase Orders" / "🖥 View Devices" in the memo detail action bar — only when a
  linked record actually exists — reused by both `openHistoryDetail()` (full) and `openMemoReadOnly()`
  (read-only, e.g. reached by clicking a memo number from the PO table) so the two views don't diverge.
  Clicking deep-links into Device Management, switching tabs and applying the memoNo filter.
- **Purchase Orders context banner**: `_poDeepLinkFilter` (memoNo-scoped) with its own banner
  ("Showing purchase orders for Memo ...", "← Back to Memo" / "Clear filter"). "Back to Memo" reopens
  the source memo via `openMemoReadOnly()`.

#### Changed
- `renderPurchaseOrders()`/`viewDevicesForPO()`/`viewDevicesForMemo()`/`viewPurchaseOrdersForMemo()`/
  `_backToPOFromDeviceRegistry()` now force a synchronous re-render off already-cached data immediately
  after switching tabs, instead of relying solely on `switchDevTab()`'s async Supabase re-fetch — so a
  freshly-applied or freshly-cleared deep-link filter is visible immediately.

#### Tests
- `tests/device.test.js`: 23 new tests covering PO search/status/project/remaining filters, PO export
  respecting filters, the Devices-column drill-down (including the zero-count no-op case), the Device
  Registry deep-link filter combining with existing search (AND), the context banner (render/Back/Clear)
  on both Device Registry and Purchase Orders, and the Memo Detail linked-buttons (shown only when a
  linked PO/device exists, hidden for non-Hardware memos, correct deep-link wiring). Also extended the
  shared test DOM stub (`classList`, `checked`) and neutralized `initMultiSelect()` in the harness (its
  own behavior is covered elsewhere, not by these tests) so the new `renderPurchaseOrders()`/`swView()`
  call chains don't require a full `<select>`/DOM implementation.
- `node --check views/device.js views/history.js tests/device.test.js tests/workflow.test.js` and
  `node --test tests/*.test.js`: clean, 558/558 passing (was 535; +23 new).

#### Manual verification
- Not performed — this folder's preview server pool was at capacity (5 servers held by other chats),
  same constraint noted in prior phases' entries. Verified by full regression test coverage above plus
  direct code review of the final diff (index.html markup, `views/device.js`, `views/history.js`).

#### Remaining Work
- Purchase Orders' Project multi-select reuses the same static option list as Device Registry's
  Project filter (`AOA-MP`/`TTB`/`Geo9`/`Release 2.1`/`Release 3`) rather than a live master list —
  pre-existing pattern (see `docs/TECHNICAL_DEBT.md` TD-7A-07), not introduced or worsened here.
- No new schema/migration — device-to-PO matching relies entirely on the existing
  `device.purchaseOrderId` field already written by `markArrived()`.

---

### 2026-07-06 License Management — UX Cleanup (Export buttons relocated, Users tab decluttered)

Scope: presentation-only cleanup per PMO request — no license/assignment/reconciliation logic, imports,
exports, data model, or unrelated tests touched.

#### Changed
- **Removed the single global "Export CSV" button** from the License Management tab bar
  (`index.html`) — it stayed visible across all four tabs regardless of which export it actually ran
  (`exportLicenseCSV()`, the License Inventory export), which was confusing.
- **Added "⬇ Export License Inventory"** to the Memo Index tab's own action row (`_renderLicMemoIndex()`,
  `views/license.js`), calling the same pre-existing `exportLicenseCSV()` — now scoped to the one tab
  it actually describes. License Summary's "Export Summary"/"Export Reconciliation" and the Users tab's
  "Export User Licenses" were already correctly tab-scoped and are unchanged. "Download Assignment
  Template"/"Import Assignments" remain on the Users tab (no separate "Assignment Import" tab exists in
  this app; introducing one would be a new nav feature, out of scope for a cleanup pass).

#### Removed
- **Users tab helper banner** ("ℹ ข้อมูลมาจาก 'ตาราง Account' ใน SL Memo — ...") — the page is
  self-explanatory without it.
- **Users tab KPI cards** (Users / Active Licenses / Projects / Manual Assignments), added in Phase 2E.
  Deleted the now-dead `_licUsrComputeKpis()`/`_renderLicUsrKpis()` helpers and their call site in
  `_renderLicUsersRows()` along with the cards' markup — nothing else referenced them. The Users tab now
  goes straight from the Review Queue (if any) into filters, then the table, matching the app's existing
  spacing conventions elsewhere (no leftover gap).

#### Tests
- `tests/license.test.js`: removed the KPI-cards regression test and the two KPI assertions inside the
  empty-state test (both tested UI that no longer exists); renamed the now KPI-free
  `licUsersKpiElements()` test helper to `licUsersFilterElements()`. All other Users tab tests (filters,
  export, Manage Licenses, deep-link, Assignment Import) unchanged and passing.
- `node --check views/license.js tests/license.test.js` and `node --test tests/*.test.js`: clean,
  535/535 passing (down from 536 — one KPI-only test removed, no other count changes).

#### Manual verification
- Not performed — this folder's preview server pool was at capacity (5 servers held by other sessions),
  same constraint noted in the Phase 2E entry above. Verified by code review instead: confirmed no other
  file references the removed KPI element ids or helper text, confirmed the Memo Index/License
  Summary/Users tabs each render exactly one export action of their own, and confirmed the full
  regression suite still passes.

#### Remaining Work
- Manual smoke test in a live browser once a preview server slot is free, to visually confirm tab
  spacing and that no console errors fire on tab switch.

---

### 2026-07-06 License Management — Phase 2E: Users Tab UX Polish (KPI cards, empty state, AND-filter/export/state-preservation regression coverage)

Scope: Phase 2E per the brief — Users tab filters, export, empty state, and four new KPI cards. Email
search, Project multi-select, and Software multi-select already existed (Phase 2D-1/2D.2) with AND
logic across categories and the User Matrix export already reading `window._licUsrVisibleUsers` (never
recomputing independently); this pass adds the KPI cards, upgrades the empty state copy, and locks all
of the above in with regression tests. No inventory, reconciliation, assignment, Assignment Import,
Memo, Budget, or Device logic touched.

#### Added
- **Four KPI cards on the Users tab** (`_renderLicUsers()`, `views/license.js`): Users, Active Licenses,
  Projects, Manual Assignments — rendered with the existing `.metric-row`/`.metric-card` CSS (same
  classes Budget vs Actual already uses, no new styling). New `_licUsrComputeKpis(users, allLicCols,
  overrides, allLicenses)` reuses the exact same `_licActiveForGroup()`/`_licUserAssignmentDetail()`/
  `_licAssignmentSourceLabel()` pipeline the table and export already call — no separate counting logic.
  `_renderLicUsrKpis()` writes the four values via `textContent`. Both are invoked from
  `_renderLicUsersRows()` on every filter change, so the cards always reflect the currently visible
  (post Search/Project/Software) list, not the full unfiltered dataset — consistent with how the
  export and table already behave.
- **Proper empty state**: the Users table body now renders "No users found." / "Try changing your
  filters." (with a 🔍 icon, matching Budget vs Actual's existing empty-state pattern) when the active
  filters exclude every user, replacing the previous single-line "ไม่พบข้อมูล" cell. The separate
  "no license data at all" empty state (before any account-list data exists) is unchanged.

#### Verified unchanged (no code change needed)
- Email search, Project multi-select, and Software multi-select already combine with AND logic across
  categories (OR only within a single multi-select's own selections) — confirmed by a new regression
  test using a multi-project user where Project scopes which of her groups exist *before* Search and
  Software are applied.
- `exportUserLicensesCSV()` already reads `window._licUsrVisibleUsers` (the exact list
  `_renderLicUsersRows()` just rendered) and only falls back to recomputing when the tab has never
  rendered in the session — it never recomputes independently once rendered.
- `_saveLicUserEditor()` already ends by calling `_closeLicUserEditor()` + `_renderLicUsersRows()`, not
  a full `_renderLicUsers()` rebuild — so Search/Project/Software filter inputs and page scroll position
  were already preserved across an open Manage Licenses → Save → return round trip; confirmed with a
  new regression test spying on `_renderLicUsers()` to prove it is never called by the save path.

#### Tests
- `tests/license.test.js`: 6 new tests — AND-logic across Search/Project/Software (including the
  multi-project-user edge case proving Project scopes groups before merging); the new empty-state copy;
  KPI card values against a fixture mixing memo-granted and manual assignments, unfiltered and filtered;
  export exactness under all three filters combined; and the Manage Licenses save round trip preserving
  filter state with zero full-tab re-renders. Full suite: 536/536 passing (up from 530).
- `node --check views/license.js tests/license.test.js` and `node --test tests/*.test.js` both clean.

#### Manual verification
- Not performed this pass — the sandbox's preview server pool for this folder was at capacity (5
  servers held by other sessions) and a new one could not be started. Verification relies on the
  regression suite above, which exercises `_renderLicUsers()`/`_renderLicUsersRows()`/
  `exportUserLicensesCSV()`/`_saveLicUserEditor()` through the same DOM-stub harness used by all
  pre-existing Users tab tests.

#### Remaining Work
- None identified for this pass's scope. A future pass could revisit whether "Manual Assignments"
  should also count Assignment-Import-sourced grants (currently counted separately, not included) if
  PMO wants that folded into a single "not from a memo" figure.

---

### 2026-07-06 License Management — Manage Licenses Modal Simplify Hotfix (seat metrics removed, flat list)

Scope: further, explicitly-requested simplification of the Manage Licenses dialog (License
Management > Users tab) on top of the two same-day layout hotfixes below. New business decision:
Purchased/Assigned/Remaining are removed from this modal entirely — they now live only in License
Summary > Reconciliation. No data model, override logic, reconciliation logic, search logic, save
behavior, exports, Review Queue, or other module change.

#### Changed
- **Removed all seat context from Manage Licenses** (`_openLicUserEditor()`, `views/license.js`):
  the `computeLicReconciliation()` call and its Purchased/Assigned/Remaining rendering are gone from
  this dialog. + Add Manual License's Project grouping now resolves purely from `getAllLicenses()`
  (which project a not-yet-assigned identity's own inventory record belongs to) — no assignment
  counting needed here at all, since nothing about seats is displayed.
- **Rows are now a single flat, borderless line**: `[checkbox] [name] [at most one <small> detail
  line]`. Current Licenses shows `Plan: X · Source: Y` (Source Memo numbers and Status dropped from
  this view — still available via License Summary > Reconciliation's Assigned Users drill-down).
  + Add Manual License shows `Plan: X` only (no Project text inside the row — Project is shown once,
  as the enclosing group's header). This replaces the two prior rounds' card-bordered,
  multi-meta-line rows, which were reported as still visually broken/overly complex.
- **+ Add Manual License Project grouping is now a plain `<div class="project-group">Project:
  X</div>` text header**, not a bordered card with a collapsible caret. The collapse/expand mechanism
  (`_toggleLicUserEditorGroup()`) is removed as dead code — sections are always expanded now.
- **The outer per-user-project wrapper only renders when a user belongs to more than one project.**
  For the common single-project case, Current Licenses and + Add Manual License render as a flat
  list with no redundant "Project: X" heading above them — matching the requested layout exactly.
  For a genuine multi-project user, each of their groups still gets its own "Project: X" heading (so
  the pre-existing independent-checkbox-scoping guarantee, tested since Phase 2A, is unaffected).
- New structural class hook: `lic-simple-row` (added alongside the pre-existing
  `lic-usr-edit-row`/`lic-usr-edit-check` classes and `data-license-name`/`data-plan`/`data-project`
  attributes that `_filterLicUserEditorOptions()`/`_saveLicUserEditor()` already query — search/save
  selectors are unchanged).
- Modal intro text and the helper copy above the search box updated to match: no longer claims seat
  context is shown in this dialog; points to License Summary > Reconciliation instead.

#### Unchanged (verified)
- `_filterLicUserEditorOptions()`, `_saveLicUserEditor()`, the override read/write shape,
  `_resolveInventoryIdentity()`, and `computeLicReconciliation()` (still used unchanged by License
  Summary > Reconciliation itself) are untouched. Modal footer (Save/Cancel, sticky/always-visible)
  from the prior layout hotfix is unchanged, as explicitly requested.

#### Tests
- `tests/license.test.js`: rewrote 5 tests whose assertions encoded now-removed content (Source
  Memo/Status on Current Licenses; Purchased/Assigned/Remaining and per-row Project text on + Add
  Manual License; the old card-styled/`lic-option-row` structure) to match the simplified behavior,
  and added a new test proving the single-project case renders with no redundant outer "Project: X"
  heading. The pre-existing multi-project independent-checkbox-scoping test (Part 1/5) and the
  save-path test both pass unchanged. Full suite: 492/492 passing (up from 491).
- Manually verified in the browser (real Supabase-backed data) at 1440×900 and a 375×812 mobile
  viewport: Current Licenses and + Add Manual License render as a flat list with plain "Project: X"
  text headers, no seat numbers anywhere in the modal, checkboxes align with their title line, and
  measured every consecutive row pair's bounding boxes — zero overlap across all 31 rendered rows.

#### Remaining Work
- None identified for this hotfix.

---

### 2026-07-06 License Management — Manage Licenses Modal Layout Hotfix (Round 2, explicit structural classes)

Scope: further markup/CSS-only follow-up to the same-day layout hotfix below, adding explicit
structural class hooks and defensive wrap/overflow guards per a stricter spec. No data model,
override logic, reconciliation logic, search logic, save behavior, exports, Review Queue, or other
module change.

#### Fixed
- **Row markup now carries explicit structural classes** (`_openLicUserEditor()`'s `licRow()` helper,
  `views/license.js`): every option row is `<label class="lic-usr-edit-row lic-option-row">` with a
  `<div class="lic-option-content">` body containing a `<div class="lic-option-title">` (software
  name) and one `<div class="lic-option-meta">` per detail field — added ALONGSIDE the pre-existing
  `lic-usr-edit-row`/`lic-usr-edit-check` classes and `data-license-name`/`data-plan`/`data-project`
  attributes that `_filterLicUserEditorOptions()` and `_saveLicUserEditor()` already query, so search
  and save selectors did not need to change.
- **Checkbox sizing hardened**: `flex:0 0 auto` (explicit, not just `flex-shrink:0`) so the checkbox
  can never grow/shrink and drift from the title line regardless of how much text wraps beside it.
- **Text overflow/escape hardened**: title and every meta line now set `white-space:normal;
  word-break:break-word;overflow-wrap:anywhere` explicitly (previously `word-break:break-word` alone),
  and the row itself gained `box-sizing:border-box;overflow:hidden` so content is guaranteed to stay
  within the card even for pathological input (e.g. one long unbroken token).
- **Current Licenses now splits Plan onto its own meta line** (previously merged into the same line as
  Source/Source Memo/Status) — consistent with + Add Manual License's existing Plan/Project/Purchased
  three-line pattern, per this round's explicit per-field-line requirement.

#### Unchanged (verified)
- `_filterLicUserEditorOptions()`, `_saveLicUserEditor()`, the override read/write shape,
  `_resolveInventoryIdentity()`, and `computeLicReconciliation()` are untouched. All pre-existing
  content/search/save tests pass unchanged (they match on visible text and the pre-existing classes,
  not exact style strings).

#### Tests
- `tests/license.test.js`: updated the prior round's row-structure test to assert the new
  `lic-option-row`/`lic-option-content`/`lic-option-title`/`lic-option-meta` classes and the
  `flex:0 0 auto`/`flex:1;min-width:0` pairing explicitly, plus a `white-space:nowrap` absence check.
  Full suite: 491/491 passing.
- Manually verified in the browser at both 1440×900 and a 375×812 mobile viewport with real
  Supabase-backed data containing long values (e.g. `Source Memo: TEST-CREATE-SL-001`): measured
  every consecutive row-pair's bounding boxes — zero overlap, consistent 8px gaps — and confirmed text
  wraps inside the card instead of escaping it, at both sizes.

#### Remaining Work
- None identified for this hotfix.

---

### 2026-07-06 License Management — Manage Licenses Modal Layout Hotfix

Scope: pure markup/CSS restructuring of the Manage Licenses dialog (License Management > Users tab)
only, on top of the same-week Current Licenses/+ Add Manual License clarity hotfix below. No data
model, override model, `licenseId` behavior, reconciliation math, Review Queue, Memo parsing, or
export change. Budget/Device/Memo/Settings/Resource untouched.

#### Fixed
- **Row layout overlap/misalignment** (`_openLicUserEditor()`, `views/license.js`): every detail
  field (Plan/Source/Source Memo/Status for Current Licenses; Plan/Project/Purchased/Assigned/
  Remaining for + Add Manual License) had been squashed onto one `<span>` line per row, and the
  name+details wrapper relied on an inline flex `<span>` with no `min-width:0` guard — long software
  names/Thai text could overflow their row and visually collide with the next one once rows started
  varying in length after the Project-grouping change. Rows now use an explicit
  checkbox + `<div style="flex:1;min-width:0">` body, with the software name in its own title `<div>`
  and every detail field in its own `<div>` beneath it (`word-break:break-word` on both), so long text
  wraps in place instead of overflowing.
- **+ Add Manual License rows now show Plan on its own line** in addition to Project and Purchased/
  Assigned/Remaining (previously Plan was omitted entirely from available rows; the seat line was a
  single merged string). Current Licenses rows are unchanged in content (Plan/Source/Source Memo/
  Status), still without Purchased/Assigned/Remaining.
- **Search input placeholder was inconsistent/missing its icon** — now shows the exact text `Search
  software, plan, or project...`, with a `🔍` icon positioned via `padding-left` so it never overlaps
  typed text.
- **Save/Cancel could scroll out of view** on a long options list (the whole modal card scrolled as
  one block). The modal card is now a fixed-height flex column: header (title/intro/search/select-all)
  and footer (Cancel/Save) are `flex-shrink:0` and stay in place; only `#lic-usr-editor-options` itself
  scrolls (`flex:1;min-height:0;overflow-y:auto`), so Save/Cancel are always visible, never require
  scrolling to reach.
- Tightened spacing consistency: outer Project-group sections, inner + Add Manual License Project
  sub-groups, and every row now use a single consistent margin/padding scale (previously a mix of
  6px/8px/10px/14px ad hoc values).

#### Unchanged (verified)
- `_saveLicUserEditor()`, the override read/write shape, `_resolveInventoryIdentity()`, and
  `computeLicReconciliation()` are untouched — only what `_openLicUserEditor()` renders changed, not
  what gets saved, how overrides resolve, or reconciliation math. Existing row classes
  (`lic-usr-edit-row`, `lic-usr-edit-check`, `lic-usr-add-group`, `lic-usr-edit-group`) and `data-*`
  attributes used by `_filterLicUserEditorOptions()`/`_saveLicUserEditor()` are unchanged, only their
  inner markup restructured.

#### Tests
- `tests/license.test.js`: added tests locking in the exact search placeholder text; the row shell
  structure (checkbox immediately followed by a `flex:1;min-width:0` body, name in its own title
  `<div>`); + Add Manual License rendering exactly 3 independent detail lines (Plan/Project/Purchased-
  Assigned-Remaining) instead of one merged line; and the modal shell's scroll/footer structure (the
  options list carries `overflow-y:auto`/`flex:1`, Save/Cancel render as siblings after the options div
  closes, not nested inside the scrollable area). All pre-existing Manage Licenses tests (grouping,
  save-path, Fix 1/2/3 content assertions) pass unchanged since they match on text content, not exact
  markup shape. Full suite: 491/491 passing (up from 488 before this hotfix).

#### Remaining Work
- None identified for this hotfix. Manually verified in the browser (real Supabase-backed data,
  1440×900 viewport): rows render with no overlap (checked row bounding boxes — each row's bottom
  edge sits strictly above the next row's top edge with the intended 8px gap), checkbox aligns with
  the title line, the search placeholder renders the exact required text with reserved icon space,
  and Save/Cancel remain on-screen after scrolling the options list to its very end.

---

### Phase 2D.2 / 2D.2.1 — License Summary Reconciliation deep-link into Users tab (2026-07-06)

Scope: navigation-only addition connecting License Summary > Reconciliation to the Users tab. No
override, reconciliation math, review queue, or export logic changed.

#### Added
- Reconciliation row detail modal (`_openLicReconDetail()`, `views/license.js`) gains a "View in
  Users tab" button, shown only when the row's `assignedCount > 0`. Clicking it
  (`_viewReconRowInUsers()`) sets a temporary, non-persisted `_licUsrDeepLinkFilter`
  (`{project, name, plan, emails}`) and switches to the Users tab, which `_renderLicUsersRows()`
  reads to narrow the visible list to exactly the assigned users from that row.
- A context banner (`_renderLicUsrContextBanner()`) on the Users tab shows which Project/Software/
  Plan the list is currently scoped to, with "← Back to Reconciliation" (`_backToReconciliationFromUsers()`
  — returns to License Summary with the Reconciliation sub-tab active) and "Clear filter"
  (`_clearLicUsrDeepLinkFilter()`) actions.
- The deep-link filter is cleared on the way back out via "Back to Reconciliation" (not preserved),
  so a later, ordinary visit to Users is never left silently narrowed. The existing Search filter
  still layers on top of the deep-link filter unchanged.
- `_licUsrDeepLinkFilter` is pure navigation/display state — it never writes to overrides, manual
  rows, review state, licenses, or memos.

#### Tests
- `tests/license.test.js`: new tests for the "View in Users tab" button's visibility gate
  (`assignedCount > 0`), the deep-link filter narrowing the Users list to the row's exact emails
  with the context banner shown, "Back to Reconciliation" both restoring the correct sub-tab and
  clearing the filter for later visits, "Clear filter" continuing to work, existing Search
  composing on top of the deep-link filter, and that viewing assigned users never mutates
  overrides/manual rows/review state.

---

### Phase 2D-1 — Software multi-select filter for License Summary/Reconciliation (2026-07-06)

Scope: License Summary and Reconciliation filter UX only. No calculation, override, or export math
changed.

#### Changed
- The Software filter on License Summary/Reconciliation (`views/license.js`) changed from a
  free-text substring search (`_bpFilterSoftware` as a string) to an exact-match multi-select
  (`_bpFilterSoftware` as an array, OR across selections, empty = no filter), using the same
  `initMultiSelect()`/`msValues()` widget already used elsewhere in the app. `_bpGetFiltered()` and
  `_bpReconApplyFilters()` both updated to the new array-membership check; Project/Plan/Status
  filters and the underlying aggregation (`_bpComputeMatrix()`, `computeLicReconciliation()`) are
  unchanged.

#### Tests
- `tests/license.test.js`: replaced the substring-search Software filter tests with multi-select
  tests — single selection narrows both Summary and Reconciliation, selecting multiple software
  values acts as OR, empty selection shows all software (no filter), and both CSV exports
  (`exportLicSummaryCSV`/`exportLicReconciliationCSV`) respect the selected values.

---

### Phase 2D — License Summary/Reconciliation shared filters and sticky columns (2026-07-06)

Scope: License Summary and Reconciliation reporting UX. No override, review queue, memo parsing,
or export-math change — filters narrow the same canonical rows both sub-tabs already computed.

#### Added
- Project (multi-select), Software (free-text at this point, upgraded to multi-select by Phase
  2D-1 above), and Plan (exact match) filters now apply to **both** the Summary matrix and the
  Reconciliation table from one shared control row (`_bpFilterProjects`/`_bpFilterSoftware`/
  `_bpFilterPlan`, module-level state mirroring the existing `_bpYear` pattern so selections
  survive the full `lic-content` re-render on every sub-tab switch). A Status multi-select filter
  applies to the Summary matrix only.
- Reconciliation gains "Over Assigned only" and "Has Remaining only" checkboxes
  (`_bpReconOverOnly`/`_bpReconRemainingOnly`), applied by a new `_bpReconApplyFilters()` after the
  existing `computeLicReconciliation()` join — filtering never changes the underlying
  Purchased/Assigned/Remaining math.
- Extracted `_bpComputeMatrix()` as the single pure aggregation function shared by the on-screen
  Summary matrix render and `exportLicSummaryCSV()`, so the two can never diverge (MASTER_SPEC
  export-parity rule) — no aggregation logic changed, only extracted from the pre-existing inline
  render code as-is.
- License Summary matrix's Software/Plan/Total columns are now sticky (frozen) while Project
  columns scroll horizontally (`style.css`), matching the sticky-column pattern already used
  elsewhere in Budget & Spend reporting tables.
- "⬇ Export Summary" button added next to the Summary filters (`exportLicSummaryCSV()` was already
  reachable elsewhere; this adds a direct entry point from the filtered view).

#### Tests
- `tests/license.test.js`: new tests for Project/Plan/Status filters narrowing the Summary matrix,
  Project/Plan filters narrowing Reconciliation, the "Over Assigned only"/"Has Remaining only"
  checkboxes, both CSV exports respecting the current filter combination and matching the on-screen
  table exactly, and a regression control proving matrix totals are unchanged when no filter is
  applied (the new filter machinery is additive, not a rewrite of the existing totals).

---

### Phase 2C — Historical License Inventory Import: dedup key fix (2026-07-06)

Analysis first (per instruction): Historical License Inventory Import already exists — both
`+ Add License` (manual, `views/license.js`) and bulk Excel import (`importBulk('license')` /
`importLicenses()`, `views/bulk_import.js`) already support seats, project, plan, cost, purchase/
expiry dates, and a free-text Memo Ref (never a real Memo record), and both already flow through
the same canonical `getAllLicenses()` into Memo Index, By Project, Reconciliation, Manage Licenses,
Assignment Import, and both exports. No new feature or template change was needed.

One real gap was found and fixed: `licenseKey()` in `views/bulk_import.js`'s `importLicenses()`
identified a license by `memoNo + name + plan + purchaseDate + expiry` — **not** `project`. Two
historical records for the same Software+Plan+dates but different Project (plausible for a
historical backfill with no Memo Ref yet, e.g. the same Figma Professional purchase window applied
to two different projects) would collide on that key, and the second row would silently overwrite
the first instead of creating a separate per-project inventory record — both across separate
imports and within a single file's duplicate rows.

#### Fixed
- `licenseKey()` (`views/bulk_import.js`) now includes `l.project` in its composite identity key.
  No other behavior, template column, or field changed; still the same dependency-free
  add-or-update-by-key logic, only scoped correctly per project now.

#### Tests
- New `tests/bulk-import.test.js` (previously zero coverage for `views/bulk_import.js` — it wasn't
  loaded into any VM test context before this) loads `app.js` -> `views/license.js` ->
  `views/bulk_import.js`, mirroring `index.html`'s real script order:
  - same Software+Plan+dates, different Project -> two separate records, neither overwritten.
  - exact duplicate row within the same file -> collapses to one record, not two.
  - re-importing the same Software+Plan+Project -> updates the existing record (seats change),
    not a duplicate — proves the fix didn't turn every re-import into a duplicate-adder.
  Full suite: 510/510 passing (`node --test tests/*.test.js`, up from 507); `node --check
  views/bulk_import.js tests/bulk-import.test.js` clean.

### Phase 2B — License Assignment Excel/CSV Import (2026-07-06)

Added bulk **Assignment Import** to License Management > Users — lets PMO upload a CSV to assign
users to *existing* License Inventory records in bulk, using the same override mechanism Manage
Licenses already writes to. This is not License Inventory import (`importBulk('license')` in
`views/bulk_import.js`, untouched) — it never creates inventory, projects, or memos, only assigns
users to what already exists.

#### 1. New data plumbing (`views/license.js`)
- `computeLicUserMappingData()` gains an optional 4th `manualRows` parameter (defaults to `[]`,
  every existing call site/test unaffected). A new manual/imported (email, project) row store,
  `_LIC_USR_MANUAL_KEY` (`orbit-lic-user-manual-rows-v1`, mirrored to Supabase `settings`
  id=`lic-user-manual-rows` — same pattern as every other License settings key, no new database
  table), lets an imported user surface in the Users tab / Reconciliation / both exports even when
  no memo ever granted them anything — previously `allUserRows` came solely from approved SL memos'
  "ตาราง Account", so a brand-new user had nowhere to attach an override. `_renderLicUsers()`,
  `exportUserLicensesCSV()`'s fallback path, and `computeLicReconciliation()` now all merge this
  store in — one merge point, no duplicated calculation logic downstream.
- Override shape gains optional `source`/`importedAt` fields (`{ active: true, licenseId, source:
  'import', importedAt }`), additive only — `_ovIsActive()`/`_resolveInventoryIdentity()` still only
  read `.active`/`.licenseId`, so every existing plain-boolean and `{active, licenseId}` override
  keeps working unchanged. `_licUserAssignmentDetail()` surfaces this as `overrideSource`; a new
  shared `_licAssignmentSourceLabel()` helper (replacing the duplicated Memo/Multiple
  memos/Manual ternary in both Manage Licenses and Reconciliation's Assigned Users drill-down) now
  also renders "Import" for an Assignment-Import-sourced entry.

#### 2. Matching + validation (pure, testable — no DOM)
- `computeAssignmentImportPreview(rows, allLicenses)` matches each row by Project + Software, then
  Plan only to disambiguate: an explicit Plan requires an exact match; a blank Plan is allowed only
  when exactly one plan exists for that Software+Project, otherwise the row is rejected as
  `ambiguous` (tracked separately from `rejected`, per spec). No inventory match -> rejected
  ("inventory not found"). A duplicate (email+software+project+plan) appearing twice in the same
  file is flagged `duplicate`, not double-counted as valid. Cancelled inventory is excluded from
  matching (consistent with every other assignable-identity computation in this file); expired
  inventory is allowed, matching the app's existing "expired is still assignable" behavior — import
  does not invent a stricter rule than Manage Licenses already has.
- `applyAssignmentImport(preview, allLicenses)` writes overrides only for `valid` rows, is idempotent
  (re-applying the same valid row does not grow the manual-row store or double-count Reconciliation's
  Assigned Users), and never touches an unrelated override.

#### 3. UI (`views/license.js`, Users tab only — Memo Index/Review Queue/Memo flow untouched)
- "Download Assignment Template" (CSV: `User Email, Software, Plan, Project, Note`) and "Import
  Assignments" buttons. Import shows a preview modal (Total/Valid/Duplicate/Ambiguous/Rejected
  counts + a per-row status/reason table) before anything is written — nothing is silently skipped.
  Confirming applies only the valid rows and re-renders the Users tab.
- CSV only, via a small dependency-free RFC4180-ish parser (`_parseCSVText`/
  `_parseAssignmentImportFile`) — not the XLSX-based `views/bulk_import.js` pipeline. Excel (.xlsx)
  upload is deferred; see `docs/TECHNICAL_DEBT.md` TD-PHASE2B-01.

#### Tests
- `tests/license.test.js`: 15 new tests covering CSV parsing/template download, blank-Plan
  single/ambiguous-plan matching, explicit-Plan disambiguation, missing-inventory rejection,
  required-field/email-format rejection reasons, cross-project disambiguation, duplicate-row
  detection, idempotent re-import (no double count), a user with zero memo history appearing in the
  Users tab/Reconciliation/export, Review-Queue independence, the "Import" source label, and
  non-interference with pre-existing legacy boolean overrides. Full suite: 507/507 passing
  (`node --test tests/*.test.js`); `node --check views/license.js tests/license.test.js` clean.

---

### 2026-07-05 License Management — Manage Licenses Modal Hotfix (Current Licenses vs + Add Manual License Clarity)

Scope: display/UX clarity hotfix for the Manage Licenses dialog (License Management > Users tab)
only. No data model, override model, `licenseId` behavior, reconciliation math, Review Queue, Memo
parsing, or export change. Budget/Device/Memo/Settings/Resource untouched.

#### Fixed
- **Current Licenses no longer shows Purchased/Assigned/Remaining seat counts**
  (`_openLicUserEditor()`, `views/license.js`): those metrics belong to License Inventory/
  Reconciliation, not a per-user assignment view, and were confusing PMO about which section they
  applied to. An active assignment row now shows only Software/Plan/Source/Source Memo/Status (via
  the existing, unchanged `_licUserAssignmentDetail()`), matching what the dialog is actually for.
- **+ Add Manual License was a flat, project-less list of software names** — PMO could not tell
  which Project's inventory record checking a box would actually pin. Every available row now shows
  an explicit "Project: X" line plus its Purchased/Assigned/Remaining (moved here from Current
  Licenses, still read as-is from the unchanged `computeLicReconciliation()`), and the list itself is
  grouped by that Project (nested "▼ Project" sub-sections, one per resolved inventory project) —
  preferring a match in the enclosing project section's own project, falling back to whichever
  project's inventory actually has the software when it doesn't. No item is hidden: a not-yet-assigned
  software with inventory in a different project than the section it's shown under still appears
  (unchanged behavior, still assignable exactly as before), now correctly labeled with its real
  Project instead of silently showing nothing.
- **Search only matched software name** — now also matches Plan and Project
  (`_filterLicUserEditorOptions()`), and hides a Project sub-group (as well as the outer project
  section) when none of its rows match.

#### Unchanged (verified)
- `_saveLicUserEditor()`, the override read/write shape (legacy boolean and `{active, licenseId}`),
  `_resolveInventoryIdentity()`, and `computeLicReconciliation()` are byte-for-byte untouched — this
  is a rendering-only change to what `_openLicUserEditor()` displays, not what gets saved or how.

#### Tests
- `tests/license.test.js`: replaced the one test that had encoded seat counts as expected on an
  *active* Current License row with two tests — one proving Current Licenses omits Purchased/
  Assigned/Remaining while keeping Plan/Source/Source Memo/Status, one proving an available row
  shows Project + the same seat math. Added tests for cross-project grouping (two available licenses
  from different projects both appear, each under its own "▼ Project" heading with the correct
  Project label) and for search matching Plan/Project and collapsing an unmatched Project sub-group.
  All pre-existing Manage Licenses tests (multi-project independent checkbox scoping, combined
  Current/Add Manual rendering, the save-path test) pass unchanged. Full suite: 488/488 passing (up
  from 480 before this hotfix).

#### Remaining Work
- None identified for this hotfix. Reconciliation, Review Queue, Memo parsing, override model, and
  exports were not touched and their existing tests pass unchanged.

---

### 2026-07-05 License Management — Phase 1: Inventory ↔ Assignment Alignment

Scope: architectural alignment between License Inventory (`getAllLicenses()`) and User Assignment
(`computeLicUserMappingData()`/override editor), fully backward compatible. No new database table,
no migration, no change to Memo workflow, Review Queue logic, or Budget/Device/Resource. All existing
overrides, memos, and users continue to function unchanged.

#### Added
- **Part 1 — Full License Inventory as the assignable universe**: `_licAssignableIdentities(allLicenses,
  legacyCols)` (`views/license.js`) widens the Manage Licenses checklist from "software discovered in
  approved memo account tables only" to the complete effective License Inventory — approved memo +
  manual + imported licenses (imported licenses already share the same `source==='manual'` store as
  hand-added ones; no separate flag exists or is needed). `_renderLicUsers()` now stores the narrow
  legacy list separately (`window._licUsrAcctCols`) from the widened assignable list
  (`window._licUsrCols`), so the save path can still tell them apart. `"Name — Plan"` is used as the
  assignable identity only when a name has more than one distinct plan in inventory; a single-plan
  name stays bare.
- **Part 2 — Override value gains an optional object shape**: `overrides[key]` may still be the plain
  legacy boolean (unchanged, byte-for-byte, only ever written for account-table-derived identities) or
  the new `{ active: boolean, licenseId?: string }` (only written for inventory-only identities,
  pinning the exact backing record for unambiguous plan/seat resolution). One shared normalizer,
  `_ovIsActive(ov, fallback)`, is used everywhere an override is read — no data migration, no schema
  change (overrides already round-trip through the existing schemaless `settings.data jsonb` blob).
- **Part 3 — License Summary Reconciliation**: a new section below the existing project matrix showing
  Project / Software / Plan / Purchased Seats / Assigned Users / Remaining Seats, computed by
  `computeLicReconciliation()` — Purchased Seats reuses the exact aggregation the existing matrix
  already performed (extracted into shared `_licSeatsByProjectSoftwarePlan()`, so License Summary and
  Reconciliation can never diverge); Assigned Users reuses the exact
  `computeLicUserMappingData()`/`_buildLicUserGroups()`/`_licActiveForGroup()` pipeline the Users tab
  uses (so the Review Queue gate and override precedence are inherited, not re-implemented). A
  negative Remaining renders an "Over Assigned" badge.
- **Part 4 — Assigned Users drill-down**: the Assigned Users count is clickable, opening a read-only
  modal (`_openLicReconDetail()`) listing each assigned user's email, Assignment Source
  (Memo/Manual/Multiple memos), Project, and Source Memo when available. No editing surface.
- **Part 7 — License Reconciliation export**: `exportLicReconciliationCSV()`, a new CSV (Project,
  Software, Plan, Purchased Seats, Assigned Users, Remaining Seats) reading the exact same
  `computeLicReconciliation()` rows the on-screen table renders. The existing User Matrix export
  (`exportUserLicensesCSV`) is unchanged/kept.

#### Changed
- `_licUserAssignmentDetail()` now falls back to resolving a manual/imported inventory identity (via
  the new `_resolveInventoryIdentity()`) when no memo directly backs it — preferring an explicit
  `licenseId` pin, then name(+plan) matching against the group's own project, then a project-less
  ("manual license with no project") record, then any remaining match. The original memo-grant
  matching path (name + project + granting memo) is tried first and is completely unchanged.
- `_licChipsForUser()` and `exportUserLicensesCSV()` now normalize an identity (legacy bare name or a
  Part 1 composite "Name — Plan") to the same `{name, plan}` shape before building chip labels/export
  columns, so a manually-assigned inventory item renders identically to a memo-granted one.
- `_saveLicUserEditor()` branches by identity: legacy account-table identities keep writing the plain
  boolean (or delete-to-reset-to-memo-default) exactly as before; new inventory-only identities write
  the `{active, licenseId}` object, resolving and pinning the backing record at save time.

#### Data flow (no tab computes its own copy)
Purchased Seats: `_licSeatsByProjectSoftwarePlan()`. Assigned Users:
`computeLicUserMappingData()`→`_buildLicUserGroups()`→`_licActiveForGroup()`. Reconciliation:
`computeLicReconciliation()` (joins the two). Users tab table, Manage Licenses, the User Matrix export,
the Reconciliation table, its drill-down, and its export all read these same functions — verified via
tests and manual browser check (a manual override written through Manage Licenses immediately appeared
correctly bucketed in Reconciliation and its drill-down, project-attributed to the pinned license's
own project, not the assigning user's group project).

#### Remaining Work
- Phase 2 (not implemented, per instruction): dedicated historical import UI beyond the existing bulk
  import.
- An "Add User" affordance (creating a brand-new (email, project) row with zero prior account-table
  presence) remains out of scope — pre-existing, larger, separately-tracked gap (see TD-AUDIT-04);
  Phase 1 only widens the *software* list inside an already-reachable user's Manage Licenses.
- `TD-M3A-01` (manual override edits have no audit trail) is unaffected by the shape widening — still
  open.
- Full suite (480 tests; `tests/license.test.js` extended to 35, covering manual/imported inventory
  assignability, legacy boolean + new object override shapes, reconciliation math, duplicate/over-
  assigned edge cases, and the read-only drill-down) passes; verified manually in the browser.

---

### 2026-07-05 License Management — Users Tab UX Follow-up (Compact Chip Preview, Combined Manage Licenses Action)

Scope: further presentation-only refinement of License Management's Users tab, on top of the
same-day "UX Revision" pass below. No business logic, license assignment logic, Review Queue, Memo
parsing, or Manual Override storage changed.

#### Changed
- **Licenses column shows compact chip previews again, capped at 3 + "+N more"** (`views/license.js`,
  `_renderLicUsersRows()`): reverts the prior pass's count-only cell ("6 licenses") back to actual
  chip names — there was enough horizontal room to preview them — while keeping the row scannable
  for users with many licenses via a `+N more` tail (hover title lists the hidden names).
- **View Details and Edit Licenses merged into a single "Manage Licenses" action**: the main table's
  Action column now has one button; the separate `#lic-usr-detail` read-only modal is gone. The
  existing `#lic-usr-editor` dialog (still keyed the same `${email}|${project}` way, still saved by
  the unchanged `_saveLicUserEditor()`) now renders each software's checkbox grouped under "Current
  Licenses" (checked, with an inline Plan/Source/Source Memo/Status line via
  `_licUserAssignmentDetail()`) or "+ Add Manual License" (unchecked, no detail — nothing assigned
  yet), instead of two separate detail-only and edit-only views.
- **"Multiple memos" source wording now resolves per (email, project) group** instead of via the
  removed cross-project `_licUserDetailRows()` merge — two memos granting the same software to the
  same user in the same project already produce >1 entries in `group.licenseSources[license]`, so no
  cross-project merge was needed to support this wording; `_licUserDetailRows()` was deleted as dead
  code once its only caller (the old View Details modal) was removed.

#### Added
- **"+ Add Manual License" makes the manual-add path explicit**: previously, adding a license meant
  checking an unlabeled box in an undifferentiated list; now every not-yet-assigned software is
  grouped under a clearly-labeled "+ Add Manual License" heading, with updated helper text explaining
  both directions ("Check an item under + Add Manual License to assign it; uncheck any item to
  remove it"). No new business logic — same checkbox, same override write.

#### Deferred (documented, not implemented)
- Free-text "add a brand-new software name never seen by any memo" was considered risky (would
  silently never match a real license record for Plan/Status, and fragments the software vocabulary
  the same way TD-7A-07 already documents for Project dropdowns) and was not implemented. Manual add
  still only offers software names already known to `allLicCols` (i.e., used by some approved SL
  memo's account table, for any project). Recorded as `TD-LIC-USR-01` in `docs/TECHNICAL_DEBT.md`.

#### Remaining Work
- None identified beyond the deferred item above. Review Queue, Manual Override storage/precedence,
  Memo Index, License Summary, and Other Subscription tabs verified unchanged. Full suite (472 tests,
  `tests/license.test.js` extended to 27 License-module tests covering the chip preview cap/overflow,
  the combined Manage Licenses render, and the manual-add grouping) passes.

---

### 2026-07-05 License Management — Users Tab UX Revision (View Details, Matrix Export, Software Filter Fix)

Scope: further presentation-only refinement of License Management's Users tab, on top of the same-day
"UX Simplification" pass below. No business logic, license assignment logic, Review Queue, Memo
parsing, or Manual Override storage changed.

#### Changed
- **Licenses column now shows a count, not chips** (`views/license.js`, `_renderLicUsersRows()`):
  "6 licenses" / "1 license" instead of inline badges, so a user with many licenses stays scannable.
  A native `title` tooltip on the cell still lists the license names (Software + Plan) on hover —
  the "simple, low-risk preview" option, no new UI chrome.
- **Action column now offers View Details and Edit Licenses** as two separate buttons, instead of
  Edit Licenses alone. "Edit Licenses" wording, the modal title ("Edit Licenses"), and a new helper
  line ("Select software this user should have. Uncheck to remove manual assignment.") make clear
  the dialog both adds and removes assignments, not remove-only. The underlying override save logic
  (`_saveLicUserEditor`) is untouched.
- **Software filter now reflects effective (post-override) assignment, not just the memo's original
  grant**: `_licUserHasAnySoftware()` filters at the user level (OR across selected software) after
  applying manual overrides, so "who has Slack" correctly includes a user whose Slack access came
  from a manual override rather than a memo checkbox. Previously the filter checked the raw
  memo-derived checkbox only, which could both hide a manually-added user and show a
  manually-removed one. Project filter and Search are unchanged (already correct, left as-is).
- **Export User Licenses is now a User × Software matrix**, not a flat list: one column per unique
  Software (+ "— Plan" when the license has one), `✓`/blank cells, respecting the tab's current
  Search/Project/Software filters (reuses the exact same visible-user list the table just rendered,
  via `window._licUsrVisibleUsers`, so export can't drift from the UI per MASTER_SPEC's export rule).

#### Added
- **View Details modal** (`_openLicUserDetail()`/`_licUserDetailRows()`): read-only expansion of a
  user's license count showing, per merged Software+Plan assignment, Source (Memo/Manual/"Multiple
  memos"), Source Memo (clickable, links to `openMemoReadOnly`), Status, Project as secondary detail,
  and Last Updated when the backing license record has one.

#### Duplicate/merge rule (unchanged principle, now also applied to View Details)
- Grouping key is still User + Software + Plan, not memo. Two memos granting the same software+plan
  merge into one license-count item, one export `✓`, and one View Details row whose Source reads
  "Multiple memos" (with all contributing memo numbers still listed) — underlying per-memo records
  are never modified, this is visual grouping only, same as the prior pass.

#### Remaining Work
- None identified for this pass. Review Queue, Manual Override storage/precedence, Memo Index,
  License Summary, and Other Subscription tabs verified unchanged. Full suite (469 tests,
  `tests/license.test.js` extended to 24 License-module tests covering count display, the software
  filter's OR/override-aware behavior, View Details content, and the matrix export) passes.

---

### 2026-07-05 License Management — Users Tab UX Simplification

Scope: presentation-only refactor of License Management's Users tab. No business logic, license
assignment logic, Review Queue, Memo parsing, or Manual Override behavior changed.

#### Changed
- **Users tab table simplified to User / Licenses / Action** (`views/license.js`): replaced the
  previous user-centric table (User / Department / Software Count, expandable per-project detail
  rows showing Program/Plan/Seat/Source Memo/Status) with a flat table showing only the user's
  email and chips for their currently assigned software. Department, Project, Seat, Source Memo,
  and Status are no longer shown in the main table — they were implementation detail the tab
  wasn't meant to expose up front.
- **License chips deduplicate by Software + Plan, not by memo**: chips are computed across all of
  a user's project groups (`_licChipsForUser`), merging identical Software+Plan pairs into one chip
  regardless of how many memos/projects granted it; different Plans for the same software render
  as separate chips (e.g. "Figma Professional" vs "Figma Enterprise").
- **Edit Licenses entry point moved from per-project expand rows to a per-user Action button**
  (`_openLicUserEditorForEmail`): opens the exact same (email, project)-keyed editor dialog
  unchanged; when a user has more than one project group, a small project switcher appears inside
  the dialog (Project info still lives "inside Edit Licenses only", never in the main table).
- **Extracted shared grouping/lookup helpers** (`_buildLicUserGroups`, `_licActiveForGroup`,
  `_licUserAssignmentDetail`) so the table render and the new export use identical business logic
  (MASTER_SPEC: exports must match the UI; no duplicated calculation logic).

#### Added
- **Export User Licenses** (`exportUserLicensesCSV()`): a dedicated CSV export for the Users tab's
  own dataset — columns are User Email, Software, Plan, Assignment Source (Memo/Manual), Source
  Memo, Status — separate from the existing Memo Index `exportLicenseCSV()`.

#### Removed
- Row expand/collapse (`_toggleLicUserRow`, `window._licUsrExpanded`) and the inline
  Program/Plan/Seat/Source Memo/Status detail table are gone from the Users tab; that detail is
  now available via Export User Licenses (and still inside the unchanged Edit Licenses dialog for
  the license names themselves).

#### Remaining Work
- None identified for this pass. Review Queue, Manual Override, Memo Index, License Summary, and
  Other Subscription tabs were verified unchanged; full test suite (467 tests, `tests/license.test.js`
  updated to lock in the new render shape) passes.

---

### 2026-07-05 UAT / Smoke Test Round — Device Registry Cache-Race Fix

Scope: focused smoke test across Memo lifecycle, Budget & Spend, License, Device, and cross-module
flows ahead of handoff. No new features, no refactors, no UI redesign, Settings/Resource untouched.
One high-confidence functional bug found and fixed; everything else observed matched documented
behavior.

#### Fixed
- **Device Registry silently drops just-created records on a second Mark Arrived / Edit Device
  save**: `markArrived()` and `saveDevice()` (`views/device.js`) both ended by calling
  `renderDevice()`, which fires a full `loadDevicesAsync()` Supabase GET that unconditionally
  overwrites the in-memory `_devCache`. Because the record(s) that same call just created/edited are
  pushed via a fire-and-forget `saveDeviceAsync()` (not awaited), that GET can resolve before the
  write is visible server-side, silently reverting the local cache to pre-write server state.
  Reproduced deterministically: a Partial Arrival followed shortly by the remaining-quantity Arrival
  on one Purchase Order left only the newest device record visible in the Device Registry (the
  earlier arrival's records disappeared from the UI, though they had in fact already reached
  Supabase and reappeared after a full reload — a real, user-visible "did this save?" defect, not
  permanent data loss). The identical pattern reproduced for Edit Device: saving an edit could show
  the field revert to its pre-edit value until a later reload. This is the exact race
  `deleteDevice()` already documents and avoids (re-rendering from the already-updated local cache
  instead of re-fetching) — `markArrived()`'s own trailing `renderDevice()` call and `saveDevice()`'s
  trailing `renderDevice()` call were the two remaining places still doing the unsafe fetch-based
  re-render. Both now re-render directly from the local cache (`_renderPOTable()`/
  `_renderDeviceTable()` for `markArrived()`, matching `submitMarkArrived()`'s existing safe pattern;
  `_renderDeviceTable()` for `saveDevice()`), matching `deleteDevice()`'s established fix — no
  behavior change beyond removing the redundant, race-prone refetch.

#### Tests
- `tests/device.test.js`: two new regression tests simulating the Supabase-online race directly (a
  fast devices GET racing a slower in-flight POST/PATCH) — one for two sequential `markArrived()`
  calls on the same PO (all device records must survive both arrivals), one for `saveDevice()`'s edit
  path (a just-saved field change must not revert). Both fail against the pre-fix code exactly as
  reproduced manually (2 devices instead of 3; edited field reverts to empty) and pass with the fix.
- Full regression suite: 460/460 passing (up from 458 before this pass — 1 pre-existing gap between
  458 documented in PROJECT_STATUS.md and 460 here reflects two new tests added by this pass).

#### Remaining Work
- No new Technical Debt items — the fix follows an already-established, already-documented pattern
  (see `deleteDevice()`'s own comment) rather than introducing a new mitigation.
- Everything else covered by this smoke test (Memo lifecycle all 5 types/Draft/Re-edit/Submit/
  Approve/Reject/Cancel/Duplicate/Void/PDF; Budget Pool/Manual Entry/Budget Tag/Forecast/Budget vs
  Actual/Export; License Memo Index/Summary/Review Queue/User Mapping/Other Subscription; Device PO/
  Partial+Full Arrival/Edit/Delete/Void protection; cross-module Software→License, Hardware→PO→
  Device, Approved→Actual Spend, Voided→downstream exclusion) matched already-documented behavior —
  no further functional defects found. See `docs/TEST_MATRIX.md`-style UAT report (session output)
  for the full pass/fail table.

---

### 2026-07-05 Final Audit Follow-up (Round 2) — Hardware Duplicate Restore, Void Rule Confirmation, Device Detail Modal Stacking

Scope: fix the three confirmed functional issues from the second final-audit follow-up review
(Hardware memo Duplicate restore, Hardware memo Void rule clarification/enforcement, Device Detail
→ Edit modal stacking). No Settings/Resource work, no UI redesign, no PO-creation logic changes.

#### Fixed
- **Hardware memo Duplicate restore**: `populateMemoTypeDetail()`'s hw branch (views/create.js)
  only ever restored hardware rows from the structured `memo.hwItems` array. Legacy/test Hardware
  memos that predate the "Memo Detail Restore" hotfix (or otherwise have `hwItems` empty/missing)
  but still have their original line items captured in the printable "รายการ Hardware" HTML table
  had nothing to restore from — Duplicating them left the Create Memo form's hardware rows empty.
  New `_hwItemsForFormRestore(memo)` (views/create.js) prefers structured `hwItems` (newer memos,
  unchanged behavior) and falls back to scraping that HTML table (name/price/qty) when `hwItems` is
  empty, mirroring views/device.js's own `_hwLineItemsFromMemo()` legacy-scrape pattern used for PO
  creation — kept as an independent helper since form restore also needs price (which PO creation
  does not) and the fix must not touch PO-creation logic at all. `populateMemoTypeDetail()` now calls
  this helper instead of checking `memo.hwItems.length` directly.
- **Hardware memo Void rule**: reviewed and confirmed (no code change needed to the guard itself —
  it was already correct) that `memoHasIrreversibleDownstreamRecords()` (app.js) blocks Void only
  when a non-deleted Device Registry record exists for the memo (`loadDevices()` already excludes
  soft-deleted rows via `_excludeDeletedDevices()`), and that a PO with zero arrivals never blocks
  Void — it instead cascades to `voided_source` per the prior audit-follow-up fix. Added explicit
  end-to-end regression coverage for the specific cases named in this review: a real Partial Arrival
  (`partial_arrived` PO with real device records) blocks Void; a fully `fulfilled` PO blocks Void; a
  PO-only memo (zero arrivals) is never blocked and cascades to `voided_source`; and a memo whose
  only device record has since been soft-deleted becomes voidable again.
- **Device Detail → Edit modal stacking**: clicking "Edit" inside the Device Detail modal
  (`openDeviceDetail()`, views/device.js) called `openDeviceModal(id)` directly, leaving the Detail
  modal open underneath. Both modals share `z-index:200`; since the Detail modal is appended to
  `document.body` after the static Edit Device modal markup already in `index.html`, equal z-index
  falls back to DOM order and the Detail modal rendered on top, hiding the newly-opened Edit modal
  behind it. The Edit button now closes the Detail modal
  (`document.getElementById('dev-detail-modal').style.display='none'`) before opening Edit Device, so
  Edit renders correctly on top — no z-index or modal-markup changes.

#### Tests
- `tests/workflow.test.js`: new test for `_hwItemsForFormRestore()` proving it prefers structured
  `hwItems` and falls back to the legacy Hardware HTML table (name/price/qty) when `hwItems` is
  empty/missing, with a clean empty result when neither is present. Updated the existing
  `populateMemoTypeDetail` structural test to check for `_hwItemsForFormRestore(memo)` instead of a
  literal `memo.hwItems` reference (the literal reference moved into the new helper).
- `tests/device.test.js`: four new end-to-end Void-rule regression tests (Partial Arrival blocks,
  Fulfilled blocks, PO-only never blocks + cascades to `voided_source`, soft-deleted device unblocks)
  and one new test confirming the Device Detail "Edit" button's onclick closes `dev-detail-modal`
  before calling `openDeviceModal()`.
- Full regression suite: 458/458 passing (up from 452 before this pass).
- Manually verified in the browser against the live app: duplicating a real legacy Hardware memo
  (`memoNo: 'TEST-PDF-HW-MQZ3LBGP'`, `hwItems: []`, HTML-only) into a Draft restored its hardware row
  ("Test Laptop", ฿30,000, qty 2, Total ฿60,000) into the Create Memo form; opening a real device's
  Detail panel and clicking Edit now closes the Detail modal and shows Edit Device correctly on top
  (previously hidden behind it).

#### Remaining Issues
- None new. No `docs/TECHNICAL_DEBT.md` entry was needed for this pass — the Void-rule review
  confirmed existing behavior was already correct (see TD-AUDIT-05 for the one already-documented,
  unrelated Void-guard cache-staleness gap), and the other two fixes are self-contained with no
  residual limitation.

---

### 2026-07-05 Final Audit Follow-up — Device/PO Void Handling, Forecast Plan Column

Scope: fix the three confirmed functional issues from the final audit follow-up review (Device
Registry source memo linkage, Voided Hardware Memo downstream PO handling, Forecast Plan column).
No UX redesign, no Settings/Resource work, no broad filter refactor — the three remaining items
from the same review (License User view, All Memo Voided visibility, multi-select filters) are
documented as future UX/interaction work only, see `docs/TECHNICAL_DEBT.md`.

#### Fixed
- **Device Registry source memo linkage**: `openDeviceModal()`/`saveDevice()` (views/device.js)
  treated every device's "Link HW Memo" field identically regardless of origin, even though the
  device record already distinguishes `source: 'memo'` (created via PO/Hardware Memo arrival) from
  `source: 'manual'`. Edit Device now makes the Link HW Memo field read-only and shows a "View
  Source Memo" button (reusing the existing `openMemoReadOnly()`) whenever the device's `source` is
  `'memo'`; manual devices remain fully editable with the button hidden. Also fixed a related latent
  bug: `saveDevice()` unconditionally wrote `source: 'manual'` into every saved record, so editing a
  memo-sourced device (e.g. just to update its Assignee) would silently flip its `source` to
  `'manual'` on the very next save, defeating the read-only guard on the following Edit open.
  `saveDevice()` now preserves the original record's `source` (and, defensively, its `memoNo`) across
  an edit/dedupe-merge instead of trusting the form's own fields for those two values.
- **Voided Hardware Memo downstream PO handling**: `voidMemoAsync()` (app.js) previously only ever
  touched the `memos` table — a Purchase Order tied to the voided memo was left completely
  untouched (still `pending_order`/`ordered`/`awaiting`, still fully actionable) with nothing on the
  PO itself indicating its source memo was voided; only `markArrived()`'s existing reactive
  memo-status check (added in a prior audit pass) stood between it and creating new Device Registry
  records. `voidMemoAsync()` now calls a new `cancelPurchaseOrdersForVoidedMemo()`
  (views/device.js), which marks every open PO for that memo with a new terminal
  `voided_source` status — never deletes a PO — and records the memo's void reason on the PO's own
  `auditLog` (reusing the existing `appendDeviceAuditLog()`/`audit_log` column, so no new Supabase
  migration is required). The PO table shows a "Voided (source memo)" badge with the void reason as
  a tooltip, excludes `voided_source` POs from the Active KPI, and (since `poActionBtn()` only wires
  buttons for the pre-existing statuses) no action button renders for it — Mark Ordered/Awaiting/
  Arrived are all structurally unreachable, not just reactively blocked. `markArrived()`'s existing
  voided/rejected/cancelled-source-memo block (prior audit pass) and `openMarkArrivedModal()`'s
  status guard both remain unchanged and continue to apply.
- **Forecast Plan column**: `_renderForecastTable()` (views/budget.js) now renders a "Plan" column
  immediately after "Program", sourced from the same software line item the row's Program/Type
  already come from. `forecastLineItems()` and `calculateForecast()` (app.js) now carry the line
  item's `plan` field (already captured at Create Memo and already present on canonical Actual
  Spend `detailLines`, just previously dropped when building Forecast rows) through as a
  display-only field — it is not part of the row-grouping key, so it does not change which rows get
  merged, and Actual Spend / Budget vs Actual (which still read the full canonical record) are
  unaffected. `forecastExportDataset()` gained the matching "Plan" export column so CSV export
  continues to match the on-screen table (MASTER_SPEC.md Export Rules).

#### Documented, not implemented (future UX/interaction work — see docs/TECHNICAL_DEBT.md)
- License User view becoming hard to read for a user with many licenses — future direction is a
  user-centric view (one row/card per user with license chips), not the current project-centric
  matrix. Not implemented — a display/interaction redesign, out of this pass's scope.
- All Memo has no dedicated Voided tab/filter (re-confirms the same gap noted in the 2026-07-05
  Functional Audit entry below) — open question is a dedicated Voided tab vs. replacing status tabs
  with All + Status filter. Not implemented — needs a UX decision first.
- Most filters across the app allow only a single selected value (project/type/status/license) —
  future direction is multi-select, applied consistently. Not implemented — a broad, cross-module
  filter refactor, explicitly out of scope for a functional-fix pass.

#### Tests
- `tests/device.test.js`: new tests for `openDeviceModal()` making Link HW Memo read-only and
  showing "View Source Memo" for a `source: 'memo'` device, keeping it editable/hidden for a
  manual device, resetting correctly when Add Device is opened right after a memo-sourced Edit, and
  `saveDevice()` preserving `source`/`memoNo` across a routine edit. New tests for
  `cancelPurchaseOrdersForVoidedMemo()`/`voidMemoAsync()`: a PO is marked `voided_source` (never
  deleted) with the void reason on its audit trail; the cascade covers every open PO for the memo
  without touching an unrelated memo's fulfilled PO; `markArrived()` stays blocked for a PO already
  flagged `voided_source`.
- `tests/financial-models.test.js`: new tests proving Forecast rows/export carry the correct `plan`
  per line item without affecting calculation totals or grouping, and that a Plan-less row (e.g.
  Infra) renders an empty Plan instead of throwing. Updated the existing Forecast export-headers
  test to include the new "Plan" column.
- Full regression suite: 452/452 passing (up from 443 before this pass).
- Manually verified in the browser against the live app: opening Edit Device on a real memo-sourced
  device (`memoNo: 'DEVTEST-M041'`) shows Link HW Memo as read-only with a working "View Source
  Memo" button that opens the real memo detail; a manual device (`id: 116`) remains fully editable
  with the button hidden; voiding a real test Hardware memo (`memoNo: 'test'`) cascaded all 3 of its
  open Purchase Orders to the new "Voided (source memo)" status with the void reason visible as a
  tooltip, no action button, and excluded from the Active KPI; the Forecast tab shows the Plan
  column populated per software line item, and `forecastExportDataset()` matches the on-screen
  table.

---

### 2026-07-05 Final Functional Audit — 8-Flow End-to-End Stabilization Pass

Scope: final pre-feature-complete functional audit of all 8 core business flows (Memo lifecycle;
Software License → License module; Hardware → Purchase Order/Device Registry; Budget flow;
Dashboard/Overview; Search/Filter/Export/Sort/Pagination/Bulk/Import; Audit log coverage; Data
integrity). No new features, no refactors, no UI redesign. Only confirmed, reproducible functional
defects were fixed; everything else is documented in `docs/TECHNICAL_DEBT.md` instead.

#### Fixed
- `confirmPmoOverride()` (views/pending.js): overriding a memo directly to "Completed" only marked
  the one approval step PMO acted in place of as `overridden` — every later, not-yet-reached
  approver step was reset to `pending` and left there permanently, even though the memo itself
  became fully `completed` (triggering PO/license creation and Actual Spend impact). This
  contradicted SYSTEM_STATE_MACHINE.md §5's own worked example. Overriding to "Completed" now marks
  every not-yet-reached step `overridden` too; overriding to a specific intermediate step
  (`pending_a2`/`pending_a3`) is unchanged — only the acted-on step resolves, matching MEMO_LIFECYCLE.md
  §8's "specific approval step" vs. "final memo approval" distinction.
- `confirmPmoOverride()` had no function-level guard on the memo's *current* status — only the
  Override button's visibility (`isPending`) prevented it from being invoked on an already-terminal
  (Rejected/Cancelled/Completed/Voided) memo. A direct call could resurrect a terminal memo in place,
  bypassing the required Duplicate-with-new-memo-number flow (SYSTEM_STATE_MACHINE.md §3/§4). The
  function itself now refuses to act unless the memo's status is `pending`/`pending_a2`/`pending_a3`.
- `saveDraft()` (views/create.js) had no memo-number uniqueness check at all —
  `saveMemo()`/`saveMemoAsync()` upsert by `memoNo`, so typing (or editing into) a number that
  already belonged to a different, non-Draft memo silently overwrote that unrelated record,
  including downgrading an Approved/Pending memo's own record back to Draft. `submitMemo()`'s
  existing Supabase conflict check was extracted into a shared `checkMemoNoConflict()` and is now
  also run by `saveDraft()` before saving, blocking on the same rule (Rejected/Cancelled memo numbers
  may still be reused; the Draft currently being edited is exempt) — closing the gap identified in
  MEMO_LIFECYCLE.md §5 ("Duplicate Memo Number is not allowed", no stated Draft exception).
- `confirmApprove()` (views/pending.js) wrote its own audit entry with `statusAfter` set to the
  intermediate action key (`'approved_a1'`/`'approved_a2'`/`'approved_a3'`) — a value `memo.status`
  never actually holds; `updateMemoStatusAsync()` always resolves to `'pending_a2'`/`'pending_a3'`/
  `'completed'`. Every Approve action's audit trail recorded a "new status" that could never match
  the live record. The audit entry now computes and records the real resulting status.
- `openDeviceModal()`/`saveDevice()` (views/device.js) read/wrote the device→memo link via a stale
  field name, `d.memoRef`, while the canonical field (used by PO-arrival device creation, the
  DB mapping, and the Void downstream-block check) is `memoNo` — matching an already-completed
  one-time migration in `_loadDevicesRaw()`. The "Link HW Memo" field therefore always showed blank
  on Edit, and saving silently blanked a device's real `memoNo`, severing its link back to the
  source memo and defeating `memoHasIrreversibleDownstreamRecords()`'s Void-block check
  (MEMO_LIFECYCLE.md §12). Both now read/write `memoNo`.
- `exportDeviceCsv()` (views/device.js) always exported every device in the system regardless of the
  active search/platform/type/status/project/company filters, disagreeing with what
  `_renderDeviceTable()` shows on screen — a direct MASTER_SPEC.md "Export Rules" violation. The
  filter predicates are now a single shared `_filteredDevices()` helper used by both the table
  render and the export, so they can no longer diverge; also fixed the export's Memo Ref column,
  which had the same stale `d.memoRef` bug as above.
- `parseLicenseFromMemo()` (views/license.js): when a software line item has no (or an invalid)
  `startMonth`, expiry falls back to `new Date(purchaseDate)` (the memo's approval/update/create
  timestamp) + `setMonth(+months)`. Without normalizing to day 1 of the month first, `Date.setMonth()`
  overflows into the next month whenever the purchase-date's day-of-month (29-31) exceeds the target
  month's day count (e.g. Jan 31 + 1 month => Mar 3, not Feb 28), silently pushing the computed
  expiry later than intended and mis-bucketing License Index's "expiring soon"/expired status. `start`
  is now always normalized to day 1 before the month arithmetic, using the same UTC-safe
  `"YYYY-MM-01"` construction already used by the `startMonth` branch.
- License Index's pagination was silently unreachable: `_renderLicMemoIndexRows()` has always looked
  for `#license-load-more` to show a "Load more"/remaining-count control, but no such element was
  ever added to `_renderLicMemoIndex()`'s own template — the list was capped at 20 rows with no way
  to see the rest, and today's `loadMoreLicense()` re-wiring (see "PDF Signature Lookup Fix" section
  below / prior audit) had nothing to attach to. Added the missing `#license-load-more` control,
  matching the exact pattern already used by All Memo/History's own Load More bar.
- `markArrived()` (views/device.js) never re-checked the source memo's status. A Hardware memo could
  be Voided while its Purchase Order still had no arrivals (correctly allowed per MEMO_LIFECYCLE.md
  §12's own example), but nothing then stopped that PO from continuing to advance and creating
  brand-new Device Registry records against the now-voided memo — contradicting
  SYSTEM_STATE_MACHINE.md §6 ("Block or require manual downstream resolution" for Device Management
  on a Voided memo) and the core principle that only Approved memos create downstream impact
  (SYSTEM_OVERVIEW.md §2). `markArrived()` now blocks with an explanatory alert if the source memo's
  status is `voided`/`rejected`/`cancelled`.

#### Investigated, not a bug (no change made)
- Overview's Budget KPI/Section-B figures (`_ovUpdateKPIs()`/`_ovRenderBvA()`, views/budget.js) do
  not shrink when the Spend Type filter chips narrow the Actual figure. Traced into the canonical
  `calculateBudgetVsActualDataset()`/`calculateBudgetUtilization()` (app.js) engine itself: a Budget
  Pool's `budget` is one undecomposed number covering potentially several Spend Types (MASTER_SPEC.md
  "One pool → many spend types"), so it is never spend-type-scoped anywhere, including in the
  already-shipped Budget vs Actual tab (Phase 7A-8) — Overview's behavior exactly matches the
  canonical tab's own established, reviewed semantics. Not a new Overview-specific inconsistency.
- Save Draft double-click race and `resetMemoForm()` interactions with manually-edited account-table
  headers were re-checked from the prior audit pass; both remain not reproducible for the same
  reasons already recorded in the 2026-07-05 Functional Audit entry below.

#### Remaining Work (documented, not fixed — see docs/TECHNICAL_DEBT.md)
- **TD-AUDIT-02 (new)**: `calculateForecast()`'s row-grouping key (`app.js`) can still merge two
  distinct same-named line items within one memo (e.g. two tiers of the same software) into one
  blended Forecast row — a narrower recurrence of the aggregation bug class already fixed once for
  this function. Not fixed here: the correct visual disambiguator (how to label the second row) is a
  display/design judgment call, not a pure logic fix, consistent with this repo's own precedent
  (TD-AUDIT-01) for not silently changing Forecast semantics.
- **TD-AUDIT-03 (new)**: `voidMemoAsync()` calls `updateMemoStatusAsync()` without
  `throwOnSyncError:true` (unlike `confirmApprove()`, which does). Combined with TD-M1-03's
  already-documented "Void/soft-delete migration not yet applied" gap, a Supabase PATCH rejection is
  silently swallowed, so a Voided memo's Actual Spend record (deleted locally) can reappear after a
  real reload once `reconcileActualSpendSources()` re-reads the still-`completed` row from Supabase.
  Not fixed here: changing Void's error-handling contract (fail loudly vs. silently degrade to local-only)
  needs a PMO/BA decision, since every other post-M1 migration-gap item in this repo has deliberately
  chosen the "keep working locally" trade-off.
- **TD-AUDIT-04 (new)**: License Management's PMO Review Queue "Reject" path drops an account list's
  rows entirely with no way to manually re-grant those specific users' licenses later, even though
  SYSTEM_STATE_MACHINE.md §7 names the flow's Reject branch "manual assignment later." No "Add user"
  affordance exists anywhere in License Management > Users to serve as that manual path. Not
  implemented — building one is a new UI affordance, out of this audit's "no new features" scope.
- **TD-AUDIT-05 (new)**: `memoHasIrreversibleDownstreamRecords()` (app.js), the Void-block check,
  reads devices via the synchronous `loadDevices()` (cache/localStorage only), not
  `loadDevicesAsync()`. On a fresh session/device where Device Management hasn't been opened yet,
  there is a narrow timing window where the check runs against a stale/empty cache before the
  startup preload resolves. Not fixed here: closing this fully means making the Void path async-await
  a fresh fetch, a broader change to a business-critical guard that warrants its own reviewed pass
  rather than a same-audit fix.
- Settings/master-data saves (`saveSettings()`, views/settings.js) write no audit entry at all —
  SYSTEM_OVERVIEW.md §8 lists "Master data changes" as requiring an audit log. Confirmed by tracing
  (zero `appendAuditLog`/audit-log references anywhere in the file). Not fixed here: this audit's
  brief explicitly excludes modifying Settings.

#### Tests
- `tests/memo-audit.test.js`: new tests for PMO Override resolving every not-yet-reached approver
  step to Overridden when the target is "Completed" (and confirming intermediate-step overrides are
  unaffected); PMO Override refusing to act on a non-Pending-family memo; `confirmApprove()` recording
  the real resulting status (`completed`/`pending_a3`) rather than the intermediate action key.
- `tests/workflow.test.js`: new tests for the shared `checkMemoNoConflict()` helper (conflict found /
  none found) and for `saveDraft()`'s control flow correctly gating on it before `saveMemo()`.
- `tests/device.test.js`: new tests for `openDeviceModal()`/`saveDevice()` preserving `memoNo` across
  an edit round-trip (and that the Void guard still blocks correctly afterward); `exportDeviceCsv()`
  respecting the active project filter; `markArrived()` blocked against a Voided source memo and
  unaffected for a normal Completed one.
- `tests/license.test.js`: new tests for the `Date.setMonth()` expiry-rollover fix (including a
  12-month regression control) and for `_renderLicMemoIndex()` rendering the Load More control.
- Full regression suite: 443/443 passing (up from 426 before this pass).
- Manually verified in the browser against the live app: License Index's Load More control renders
  and correctly reveals all 45 real licenses in two clicks; Device Registry's Export CSV now returns
  exactly the 5 devices visible under an active project filter (previously all 115); editing a real
  device (id 116, `memoNo: 'DEVTEST-M037'`) through the modal preserves its memo link instead of
  blanking it (test edit reverted afterward); `checkMemoNoConflict()` correctly detects a real
  in-use memo number and returns `null` for an unused one against the live Supabase backend. No
  console errors observed across History, Pending, Budget & Spend, License, Device, or Create Memo.

---

### 2026-07-05 PDF Signature Lookup Fix

Scope: fix a confirmed defect where an approver's uploaded signature did not appear on the
downloaded memo PDF even though the memo was approved and a signature existed. No PDF layout,
storage, or workflow changes.

#### Fixed
- `_preloadSignatures()` (views/settings.js) resolved a signature by an exact string match on the
  approver's assigned memo name only. Signatures are saved under whatever free-text "ชื่อในระบบ
  Memo" a user types in Settings, which can legitimately differ from the canonical `full_name`
  recorded as the approver on a memo (e.g. a nickname or alias). Confirmed in production data: a
  real approved memo's approver name (`profileId` 3, canonical `full_name`) had a signature saved
  only under alias-like name variants, so the exact-match lookup always missed and the PDF
  rendered an empty signature box. `_preloadSignatures()` now falls back to resolving the
  approver's profile (by `profileId`, or `findUserByName()` as a secondary fallback) and retries
  the lookup under that profile's canonical `full_name` and each `name_aliases` entry before
  giving up. Exact-name matches (the previously-working case) are tried first and unchanged.
- `tests/pdf-document.test.js` — 3 new tests covering: alias-fallback resolution, exact-name match
  still taking priority over the alias fallback, and a clean null (no crash) when no signature
  exists under any known name.

#### Remaining Work
- Signature is still resolved live (latest Settings upload) at PDF-generation time, not captured
  as an immutable snapshot at the moment of approval — see TD-PDF-01.

---

### 2026-07-05 Functional Audit — Memo → Approval → Budget → License → Device end-to-end

Scope: complete functional audit of the Memo → Approval → Budget → Actual Spend → Forecast →
Budget vs Actual → License → Purchase Order → Device Registry flow. No new features, no UI
redesign. Only confirmed functional/logic/business-rule/propagation bugs were fixed.

#### Fixed
- `calculateForecast()` (app.js) previously aggregated every Software line item in a memo into
  one joined Forecast row (e.g. "Product A, Product B") using the memo's combined coverage
  envelope and total amount. It now expands a Software Actual Spend record's `detailLines` into
  one independent Forecast row per line item (own program name, own amount, own coverage months),
  matching MASTER_SPEC.md's Forecast Rules ("Monthly Cost = Amount / Coverage Months" per item).
  Actual Spend / Budget vs Actual totals are unaffected — they still read one record per memo.
- `createPurchaseOrdersFromMemo()` (views/device.js): a Hardware memo with two line items sharing
  the same item name (e.g. two separate "iPhone 13" rows with different specs) collided on both
  the dedup check and the generated PO id (`memoNo + itemName`), silently dropping the second
  line's quantity from Purchase Order creation. The PO id and dedup key now include the line's
  index within the memo, so duplicate-named lines each get their own PO.
- `parseLicenseFromMemo()` (views/license.js): two License memo line items sharing the same
  name/plan/coverage collided on the same derived id, so Edit/Delete on the second row silently
  acted on the first row's data. The id now includes the line's index within the memo.
- `loadMoreLicense()` (views/license.js) called a non-existent `_renderLicMemoIndexTable()`
  (unreachable dead code — no UI wires it up today, but it would throw if ever invoked). Repointed
  to the real pagination render function, `_renderLicMemoIndexRows()`.
- `prepareMemoForSubmission()` (app.js): Submit only wrote an audit log entry when the A1-bypass
  (requester is also A1) path fired; a normal submission produced no audit entry at all,
  contradicting MEMO_LIFECYCLE.md §17. Submit now always appends a "Submitted" audit entry.
- `duplicateMemo()` / `reeditRejectedMemo()` (views/history.js): Duplicate and Re-edit Rejected
  never wrote an audit entry on the original memo. Both now append a "Duplicated by ..." /
  "Re-edited (Rejected) by ..." entry to the original memo (local-only persistence, matching the
  existing precedent set by `saveBudgetTag()`).
- `confirmPmoOverride()` / `cancelMemo()` (views/pending.js): both called `appendAuditLog()`
  without the `extra` argument, so PMO Override and Cancel audit entries always had
  `statusBefore`/`statusAfter`/`evidenceUrl` recorded as `null` even though the data was available
  at the call site (Override even *requires* evidence upload before it can submit). Both now pass
  the previous/new status and, for Override, the evidence URL.

#### Investigated, not a bug (no change made)
- Save Draft double-click race: a rapid double-click was suspected of creating two draft records,
  since the generated `DRAFT-<timestamp>` memo number is only written to a local variable, not
  back into `#f-memo-no`, before the blocking `alert()` fires. On closer trace, `saveDraft()` is
  fully synchronous up to that `alert()` call; a browser's `alert()` blocks the JS event loop, so a
  second click's handler cannot begin running until the first alert is dismissed. Not reproducible
  under normal single-tab browser semantics.
- `resetMemoForm()` and manually-edited Account-table column headers (`#acct-cols .acct-col`,
  `data-manual="true"`): suspected these survive a form reset since `acct-cols` isn't in the
  container `innerHTML`-clear list. On closer trace, they are `<input>` elements inside
  `#form-body`, so the earlier blanket `#form-body input` value-clear already blanks them; no gap.

#### Remaining Work (documented, not fixed — see docs/TECHNICAL_DEBT.md)
- **TD-AUDIT-01 (new)**: the Forecast tab's embedded "Budget vs Actual" widget
  (`_renderBudgetVsActual()`, views/budget.js) is a third, independent allocation engine — it never
  calls `calculateBudgetVsActualDataset()`/`findMatchingBudgetPools()`/`mapBudgetPool()`, instead
  re-deriving Actual from a raw memo walk and Budget from the legacy `loadSLBudgets()` annual
  setting, on a rolling-window basis. Its numbers can disagree with the real Budget vs Actual tab
  for the same nominal project/period. Not fixed here — swapping its calculation engine changes
  on-screen numbers/semantics and, per this repo's own precedent (TD-7A-09), needs a scoped design
  decision, not a silent audit fix. `buildActualByMonth()`/`getActualInRange()` (views/budget.js)
  are dead code tied to the same widget.
- License Management has no "Approve All / Reject All" bulk action in the PMO Review Queue (only
  per-memo Approve/Reject). SYSTEM_STATE_MACHINE.md §7 names the flow "Approve All / Reject All";
  the per-item buttons are functionally correct but not a literal bulk action. Not implemented —
  out of this audit's "no new features" scope; flagged for a future UI decision.
- All Memo has no dedicated "Voided" filter tab/count (SYSTEM_OVERVIEW.md §3.3 lists Voided as one
  of the tracked statuses). Voided memos are fully visible and correctly labeled under the "All"
  tab today — this is a missing filter convenience, not a data-visibility or data-correctness bug.
  Not implemented — adding a new tab is a UI change, out of this audit's scope.

#### Tests
- `tests/financial-models.test.js`: rewrote the test that had encoded the Forecast aggregation bug
  as expected behavior; added a companion test proving a single line item still yields exactly one
  row (no over-splitting).
- `tests/device.test.js`: new regression test for duplicate-named Hardware line items each getting
  their own PO with a unique id and unclipped quantity.
- `tests/license.test.js`: new regression test for duplicate-named License line items each getting
  a unique id with seat counts preserved.
- `tests/workflow.test.js`: updated the submission test that had asserted zero audit entries for a
  normal (non-bypass) submission.
- `tests/memo-audit.test.js` (new file): regression tests for the PMO Override / Cancel /
  Duplicate / Re-edit Rejected audit-log gaps, using a stateful VM harness (app.js + pending.js +
  history.js) with real localStorage persistence.

---

### PDF Business Document Milestone - Approval Info, Timeline, Status Banner, Printing

Scope: make the generated memo PDF (`renderMemoPdf()`, app.js) a complete business/audit
document, matching MEMO_LIFECYCLE.md §9.2's requirement that an Approved memo PDF show
"Approval status, Approval log, Approver name, Approval timestamp". No UI redesign, no changes to
Settings/Resource/Software Master/Device Type Master/Auth/Theme/CSS polish/responsive layout.

#### Added
- `computeApprovalTimelineEvents(memo)` (views/history.js) — extracted from the previously
  unused `buildApprovalTimeline()`, now the single data source for the chronological Approval
  Timeline (Draft → Submitted → Reviewed/Approved → PMO Override → Rejected/Cancelled/Voided →
  Completed, only applicable events shown). Reused by both the screen widget
  (`buildApprovalTimeline()`) and a new print renderer (`buildApprovalTimelinePdfHtml()`).
- `buildApprovalInfoRows(memo)` (views/history.js) — single data source for Reviewer, Approver,
  PMO Override + reason, Self Review, approval timestamps, Rejected/Cancelled/Void reason+by+at.
  Rows are only included when the underlying data exists (empty blocks hidden). Reused by both a
  new screen widget (`_buildMemoApprovalInfoHtml()`, wired into `_buildMemoDetailContent()` —
  History's "View Memo" canonical detail view) and a new print renderer
  (`buildApprovalInfoPdfHtml()`, using the existing shared `table()` helper from app.js).
- Status Banner in the PDF header (`renderMemoPdf()`), reusing `histStatusLabel()` /
  `histStatusBadgeClass()` (app.js) directly — no second status→label mapping.
- Approval Record appendix in the PDF: a new page (`page-break-before:always`) after the official
  signed memo body, containing the Status Banner, Approval Information table, and Approval
  Timeline table — added, not mixed into, the existing officially-signed memo layout.
- `index.html`: base typography for the `.mp-*` classes `renderMemoPdf()` emits, an `@page { size:
  A4; ... }` rule, and print page-break rules (`page-break-inside:avoid` for rows/the signature
  grid, `thead{display:table-header-group}` for repeating table headers) — previously the local
  browser print fallback (used when the external PDF server is unreachable) had zero CSS for these
  classes and no guaranteed page size.
- `tests/pdf-document.test.js` — 29 new behavioral tests: Approval Timeline/Status Banner/Void
  document/Rejected document/Cancelled document/PMO Override/Self Review/Duplicate document, all
  five memo types (SL/HW/INT/ENT/DEP), and a same-source-data regression guard proving the PDF and
  the History detail view render Approval Information/Timeline from identical row/event data.

#### Changed
- `views/history.js` `_buildMemoDetailContent()` now renders an Approval Timeline block and the
  new Approval Information block (replacing the old rejection/cancellation-only note, which is now
  a subset of the new block's rows) — closes the pre-existing gap where PMO Override, Self Review,
  and Void reason/by/at were captured on the memo record but never shown anywhere.

#### Fixed
- The local browser print fallback (`window.print()` when `memo-pdf-server.onrender.com` is
  unreachable) previously rendered the memo essentially unstyled with no guaranteed page size —
  see Added above.

#### Remaining Work
- The primary PDF path (`memo-pdf-server.onrender.com`) is an external, unverified-from-this-repo
  service; true per-page running header/footer and exact pagination fidelity there cannot be
  confirmed without access to its implementation. The Approval Record appendix uses plain inline
  styles (no dependency on that server's own `.mp-*` stylesheet) specifically to render correctly
  regardless of its internals.
- The existing officially-signed memo signature grid (minimum 2 boxes, synthesized placeholder
  titles when reviewer/approver data is incomplete) was deliberately left unchanged — it backs a
  physical/ink-signature workflow. "Hide empty blocks" (Task 5) was implemented in the new
  Approval Information section instead, which only lists a Reviewer/Approver/PMO Override/Self
  Review row when the underlying data exists.
- `style.css` at the repo root is not linked from `index.html` (confirmed: no `<link>` reference
  anywhere) and was already fully orphaned before this change — its `.pdf-*`/`.mp-*` rules are
  dead. Left untouched (out of scope: unrelated file, no observable behavior) but now stale
  relative to `index.html`'s copy; flagged for cleanup in a future phase.

---

### Milestone 3B acceptance review fixes — Device delete refresh, delete scope, Mark Arrived name mapping (2026-07-03)

Three issues raised during Milestone 3B acceptance review, investigated and fixed in `views/device.js`.
No PDF work started, no Settings/UI theme changes, per instruction.

#### 1. Device delete UI refresh (root cause found and fixed)
- **Root cause**: `deleteDevice()` called `deleteDeviceAsync(id)` without awaiting it, then immediately
  called `renderDevice()`. `renderDevice()` triggers `loadDevicesAsync()` — a fresh Supabase `GET` of
  the whole devices table — which could resolve *before* the delete's own Supabase `PATCH` had
  landed server-side, overwriting the correctly-updated local cache with stale (not-yet-deleted) data
  and making the just-deleted row reappear until a manual page reload.
- **Fix**: `deleteDevice()` now awaits `deleteDeviceAsync(id)` and re-renders directly via
  `_renderDeviceTable()` (reading the already-updated local cache, no redundant fetch) instead of
  calling `renderDevice()` — mirroring the pattern `submitMarkArrived()` already used for the same
  reason.

#### 2. Device delete scope (verified correct; found and fixed a related bug)
- `deleteDeviceAsync(id)` was already correctly scoped to exactly one record (matched by `id`, no
  `memoNo`/`purchaseOrderId` filtering) — confirmed with a new multi-sibling test.
- **Found while investigating**: `_renderDeviceTable()`'s row-click, Edit, and Delete `onclick`
  handlers interpolated `${d.id}` **unquoted** into the generated HTML (e.g.
  `onclick="deleteDevice(123)"`). For a device whose `id` is still the local string placeholder
  (`dev_<timestamp>_<n>`, true for any device added manually or arrived via Mark Arrived until the
  next full reload from Supabase — i.e. exactly the devices a PMO user is most likely to interact
  with right after creating them), this produced a bare identifier reference
  (`onclick="deleteDevice(dev_1730000000_0)"`) that throws `ReferenceError` on click and silently does
  nothing — Delete/Edit/View would appear to not work at all for a freshly created or freshly arrived
  device in the same session.
- **Fix**: `_renderDeviceTable()`, `openDeviceDetail()` (its Edit button, photo upload input, and photo
  remove button), now all quote the id (`'${esc(String(d.id))}'`). `openDeviceModal()`,
  `openDeviceDetail()`, `uploadDevicePhoto()`, and `removeDevicePhoto()` now compare
  `String(dev.id) === String(id)` instead of strict `===`, so lookups work correctly regardless of
  whether `id` is a Supabase-assigned number or a local string placeholder.

#### 3. Device Registry name mapping after Mark Arrived (verified correct; added a defensive guard)
- Extensive verification against real production data (all completed Hardware memos' PO `itemName`
  and their arrived devices' `name` fields) and direct function-level testing found the mapping
  already correct end-to-end: `_hwLineItemsFromMemo()` → `createPurchaseOrdersFromMemo()`'s
  `po.itemName` → `markArrived()`'s `device.name = po.itemName` already preserves the real hardware
  item name (e.g. "MacBook Pro", "iPhone 13"), never the memo number, in both the structured `hwItems`
  path and the legacy HTML-scrape fallback, independent of whether Serial/Asset is blank.
- **Defensive fix added anyway**: `markArrived()`'s device `name` now falls back to the literal string
  `'Unnamed Hardware Item'` (never blank, never the memo number) in the edge case of a PO record with
  no `itemName` at all (e.g. manually corrupted/malformed PO data) — closing the one path that could
  theoretically have shown a blank name.

#### Tests
- 7 new tests added to `tests/device.test.js`: `deleteDevice()` no longer resurrects a deleted row via
  a stale Supabase re-fetch race; `deleteDeviceAsync()` only hides the targeted device among multiple
  siblings from the same memo/PO; `_renderDeviceTable()`'s onclick handlers are properly quoted for a
  non-numeric device id; `openDeviceModal()`/`openDeviceDetail()` resolve a string-id device without
  throwing; a device created via Mark Arrived preserves the item name from `memo.hwItems` end-to-end
  (blank serial included); the same via the legacy HTML fallback path; and the new
  `'Unnamed Hardware Item'` fallback for a PO with no `itemName`.
- Full suite: `node --test tests/*.test.js` — **387/387 passing** (was 380, net +7). `node --check`
  clean on `views/device.js` and `tests/device.test.js`.
- Manually verified in-browser against live Supabase data (read-only checks only): confirmed the
  rendered row HTML now quotes device ids (`onclick="openDeviceDetail('116')"`); confirmed
  `openDeviceDetail()` opens correctly for a real device and shows its actual item name ("Stylus"),
  not a memo number; no console errors. One test PO was briefly written to the shared Supabase project
  while investigating issue 3 (`TEST-M3B-BUGCHECK-001`) and was deleted immediately after
  confirmation — no test data was left behind.

#### Not changed (explicitly out of scope for this fix round)
- PDF milestone, Settings/UI theme — untouched, per instruction.
- `saveDevice()`'s end-of-function `renderDevice()` call uses the same fire-and-forget-then-refetch
  shape that caused issue 1 for delete. It was **not** changed here (not reported, and this fix round
  was scoped to the three listed issues) — flagged as a related, not-yet-confirmed risk for a
  follow-up if Add/Edit Device is ever observed to show similarly stale data immediately after saving.

### Milestone 3B — Device Logic: PO from structured hwItems, Device/PO audit log, Device soft delete (2026-07-03)

Source: `docs/IMPLEMENTATION_ROADMAP.md` Milestone 3B, following the accepted Milestone 3B plan.
Scope: switch Purchase Order creation to structured `memo.hwItems` (with legacy HTML fallback),
add audit logging for Device/PO actions, implement Device Registry soft delete, and add behavioral
tests. Device Type Settings UI, the Settings page, Resource merge, QR/scan enhancements, UI
redesign, and actor-stamping for secondary write paths (bulk import, photo upload) are explicitly
out of scope and untouched.

#### 1. Purchase Order creation reads structured `hwItems` (closes audit finding G-13)
- `views/device.js` — new `_hwLineItemsFromMemo(memo)` extracts `{name, qty}` pairs, preferring the
  structured `memo.hwItems` array (`{name, price, qty}`, already collected by Create Memo's
  `collectMemoData()` and persisted via `memoToDb()`/`dbToMemo()`'s `hw_items` column since the
  "Memo Detail Restore" hotfix) over scraping the printable HTML table. A cosmetic edit to Create
  Memo's Hardware table markup can no longer silently stop PO creation.
- **Legacy fallback preserved**: when `hwItems` is missing or empty (Hardware memos approved before
  that hotfix shipped), `_hwLineItemsFromMemo()` falls back to the original `DOMParser` scrape of the
  `'รายการ Hardware'` section — historical memos still produce POs correctly.
- `createPurchaseOrdersFromMemo()`'s dedupe-by-`memoNo + itemName` behavior is unchanged. No changes
  to Create Memo's UI or `views/create.js`'s data collection — the structured data already existed.

#### 2. Device / Purchase Order audit log
- New `appendDeviceAuditLog(record, action, extra)` (`views/device.js`) — mirrors `app.js`'s
  `appendAuditLog()` shape (`action, actor, timestamp, comment, statusBefore, statusAfter`) but
  operates on a single device/PO record in place, since neither table has a status-transition helper
  like `updateMemoStatusAsync()`.
- Audited actions: manual device Create/Edit (`saveDevice()`), PO status changes
  (`advancePOStatus()`), Mark Arrived (`markArrived()` — one entry on the PO for the arrival, one
  entry per newly created device referencing the originating PO), and device Delete (soft delete,
  see below).
- New `devices.audit_log` / `purchase_orders.audit_log` (jsonb) columns, mapped in
  `deviceToDb()`/`dbToDevice()` and `poToDb()`/`dbToPo()`. `saveDeviceAsync()` (POST and PATCH paths)
  and `savePurchaseOrderAsync()` (POST and PATCH paths) retry once without `audit_log` on the
  specific PGRST204 "missing column" schema-cache error (`isMissingDeviceAuditColumnError()`,
  mirroring `views/budget.js`'s `isMissingAuditLogColumnError()`/`saveManualExpenseAsync()` pattern)
  so Create/Edit/Mark Arrived/Status Change keep persisting their other fields even before the
  migration below is applied.
- No UI surface added for the new audit trail (Device Detail / Purchase Orders table are unchanged)
  — out of scope per "keep UI unchanged unless required for function"; tracked as `TD-M3B-01`.

#### 3. Device Registry soft delete (addresses part of audit finding G-02 for devices)
- `deleteDeviceAsync()` no longer issues a hard Supabase `DELETE`. It now marks the record
  `deleted:true` with `deletedAt`/`deletedBy` and appends a `'Deleted'` audit entry, then `PATCH`es
  Supabase (with the same `audit_log` PGRST204 retry-fallback as above) — mirroring the soft-delete
  pattern already used for memo Draft delete (`app.js`) and Manual Expense void (`views/budget.js`).
- `loadDevices()`/`loadDevicesAsync()` now filter out `deleted:true` rows at the single shared read
  path (mirroring `app.js`'s `_excludeDeletedMemos()`) — soft-deleted devices disappear from the
  Device Registry table, summaries, CSV export, and search with no per-view changes needed.
- New internal raw accessor `_loadDevicesRaw()` — `saveDeviceAsync()`, `deleteDeviceAsync()`,
  `markArrived()`, and `importDeviceBulk()` now read the *unfiltered* list before writing the full
  array back via `storeDevices()`, so an unrelated save/import/arrival can no longer silently drop an
  already soft-deleted device from the local cache/localStorage backup (the same risk shape
  documented for memos in `TD-M1-03` item 2, avoided here by design rather than accepted).
- `findExistingDevice()`'s dedup-by-serial/asset-tag check (manual Add/Edit) and
  `importDeviceBulk()`'s dedup-by-serial check both read the *filtered* (active-only) device list, so
  a soft-deleted device's serial/asset tag becomes reusable immediately — mirroring the memo-number
  reuse-after-soft-delete correction from Milestone 1B.
- `memoHasIrreversibleDownstreamRecords()` (`app.js`, the memo Void downstream guard) needed **no
  code change** — it already calls `loadDevices()`, so a soft-deleted device automatically stops
  blocking Void through the same shared filtered read path.
- New migration `supabase/migrations/20260703180000_device_registry_m3b.sql`: additive
  `devices.deleted`/`deleted_at`/`deleted_by`/`audit_log` and `purchase_orders.audit_log` columns.

#### Tests
- New `tests/device.test.js` (21 tests): PO creation from `hwItems` (multi-line, dedupe, non-hw/non-
  completed no-ops), legacy HTML fallback (missing and empty `hwItems`), the "5 ordered → 3 arrive →
  2 arrive later" partial-arrival scenario from `SYSTEM_STATE_MACHINE.md` §8 (including arrival-qty
  clamping and the not-yet-awaiting guard), audit entries for Mark Arrived / PO status change /
  device Create+Edit (including prior-history preservation on edit), the `audit_log` PGRST204
  retry-fallback for both `saveDeviceAsync()` and `savePurchaseOrderAsync()` (and that an unrelated
  Supabase failure still doesn't block local persistence, matching this file's pre-existing
  catch-and-warn convention), device soft delete (hidden from `loadDevices()`, retained in
  persistence, retried audit-log fallback), soft-deleted serial reuse, and both directions of the
  Void-downstream-guard interaction (soft-deleted device does not block Void; an active device still
  does).
- Full suite: `node --test tests/*.test.js` — **380/380 passing** (was 359, net +21). `node --check`
  clean on `views/device.js`, `tests/device.test.js`, and every other touched/adjacent JS file.
- Manually verified in-browser (static server, live Supabase data): Device Management's Device
  Registry (116 devices) and Purchase Orders (36 POs) tabs both render correctly against real,
  pre-existing Supabase rows with the new `audit_log`/soft-delete field mappings in place — no
  console errors, no visual change (no write actions were performed against the live database during
  this check).

#### Technical debt
- New `docs/TECHNICAL_DEBT.md` **TD-M3B-01** (OPEN): the new migration is not yet applied to the live
  Supabase project (same deployment-prerequisite shape as every prior milestone); the new Device/PO
  audit trail has no UI surface yet (by design, out of scope for this milestone); `importDeviceBulk()`
  has no dedicated behavioral test for its soft-delete-safe merge (low risk, shares already-tested
  helpers).

#### Not changed (explicitly out of scope for Milestone 3B)
- Device Type Settings UI, the Settings page, Resource merge, QR/scan enhancements, UI redesign,
  actor-stamping (`createdBy`/`updatedBy`) for bulk import and device-photo upload/remove (`TD-M2-01`
  item 5, unchanged), and all future milestones.

### Milestone 3A — License Logic: PMO Review Queue for account lists (2026-07-03)

Source: `docs/IMPLEMENTATION_ROADMAP.md` Milestone 3A, following the locked business decisions
(memo-level queue granularity, grandfather cutoff, reject excludes but doesn't block manual
override). Scope: License Review Queue, memo-level approve/reject, User Mapping gate, audit
logging for review actions, and regression tests — nothing else. Manual License CRUD soft
delete/audit timeline, License materialization, Software Master, FX/currency changes, and the
Settings page are explicitly out of scope and untouched, per instruction. License Index and
License Summary tabs are unchanged.

#### License Review Queue (`views/license.js`)
- An approved SL memo's account list ("ตาราง Account") is now gated before it reaches the live
  User Mapping table (`License Management > Users`), closing audit finding G-10. Gate is
  **memo-level**: a memo's whole account list is approved or rejected as one set, not per row.
- New review-state store, `_LIC_REVIEW_KEY` (`orbit-lic-user-review-status-v1`), following the
  exact same generic-`settings`-table pattern already used for `_LIC_USR_OV_KEY`/`_LIC_SETTINGS_KEY`
  — no new Supabase table. Shape: `{ [memoNo]: { status, reviewedBy, reviewedAt, reason, auditLog } }`.
- **Grandfather rule**: `licReviewDefaultStatus(memo)` compares the memo's `approvedAt` (falling
  back to `updatedAt`/`createdAt`) against a fixed rollout cutoff, `LIC_REVIEW_ROLLOUT_AT =
  '2026-07-03T00:00:00.000Z'`. Any memo approved before that instant — i.e. every real memo that
  existed prior to this feature — defaults to `approved` with no review record needed, so PMO
  never loses visibility into user-license data already live. Only memos approved at/after that
  instant default to `pending` when no explicit review record exists.
- New pure function `computeLicUserMappingData(memos, reviewState, parseAcctFn)` (no DOM access,
  directly unit-testable) replaces the un-gated loop inside `_renderLicUsers()`: `pending` memos'
  rows go to a queue list instead of the mapping table; `rejected` memos' rows are simply omitted
  from both.
- New Review Queue UI block (`_renderLicReviewQueueHtml()`) rendered above the existing Users
  table — memo no., project, account count, software count, and **View Memo / Approve / Reject**
  actions. Uses the existing card/table/button styles already in `views/license.js`; no new
  components, no layout change elsewhere. Renders nothing when the queue is empty.
- **View Memo** reuses the existing `openMemoReadOnly()` (`views/history.js`) via the same guarded
  `typeof openMemoReadOnly==='function'` call already used elsewhere in this file for the Memo No.
  link on the License Index tab — no new memo viewer was built.
- **Reject** behavior: rejected rows are excluded from User Mapping, but the pre-existing manual
  override editor (`_openLicUserEditor`/`_saveLicUserEditor`, "Edit licenses") and its store
  (`_LIC_USR_OV_KEY`) are completely untouched by review status — PMO can still manually assign a
  user via the existing mechanism for any row that is otherwise visible.
- **Audit**: every Approve/Reject writes a structured entry
  (`action, actor, timestamp, previousStatus, newStatus, memoNo, reason`) into the review-status
  record itself, not into the memo's own `auditLog`. Deliberate choice: License review
  approve/reject on a completed memo is not one of the actions MEMO_LIFECYCLE §4 lists as allowed
  on an Approved memo (unlike Budget Tag, which explicitly is and already uses the shared
  `appendAuditLog()` on the memo) — keeping the audit trail inside the review-status record avoids
  writing to an otherwise-immutable Approved memo. Reject requires a reason (`prompt()`, matching
  the existing minimal-UI pattern already used for `deleteLicense()`'s `confirm()`); Approve does
  not.
- `renderLicense()` now also loads review state (`_loadLicReviewStateAsync()`) in its startup
  `Promise.all`, alongside the existing manual-license/settings/overrides loads.
- License Index and License Summary tabs, `getAllLicenses()`, `parseLicenseFromMemo()`, and Void's
  existing exclusion behavior (gates on `status==='completed'`) are all unchanged — Voided memos
  remain excluded from both the queue and User Mapping with zero new code, same as before.

#### Tests
- New `tests/license.test.js` (15 tests): grandfather default for pre-cutoff memos, pending queue
  entry for post-cutoff memos, pending/rejected exclusion from User Mapping, approve moves a row
  into User Mapping, reject leaves User Mapping unaffected without disabling the manual override
  store, View Memo's guarded `openMemoReadOnly()` call (and a static check that no new memo viewer
  function was added), empty-queue rendering, audit entry shape and reason capture for
  approve/reject, cancelling the reject prompt leaves status unchanged, Voided memo exclusion,
  explicit review record always overriding the default, memos with no account list never entering
  the queue, and review-state localStorage round-trip.
- Full suite: `node --test tests/*.test.js` — **359/359 passing** (was 344, net +15). `node --check`
  clean on `app.js`, `views/license.js`, and `tests/license.test.js`.
- Manually verified in-browser (static server, live Supabase data): existing production account-list
  data (pre-cutoff) renders in User Mapping exactly as before, with no Review Queue shown. Injected
  a synthetic post-cutoff SL memo with an account-table section directly into the local memo cache
  (never written to Supabase) — confirmed it appeared in the Review Queue (not User Mapping), and
  that clicking Approve moved its user into the User Mapping table live with no page reload and no
  console errors. Cleaned up the injected local-only test data afterward.

#### Technical debt
- New `docs/TECHNICAL_DEBT.md` TD-M3A-01 (OPEN): the pre-existing manual override editor
  (`_saveLicUserEditor()`) still has no audit trail — deferred because its store's flat-boolean
  shape would need restructuring to add audit metadata without touching every existing read site,
  which is not a small, low-risk change. Review Queue's own audit logging (in scope for this
  milestone) is unaffected.

### Milestone 2 follow-up — Currency revert, Budget Pool loading fix, Manual Entry audit timeline (2026-07-03)

Three confirmed follow-up fixes before Milestone 3, per explicit instruction: revert currency to
THB-only, fix Budget Settings' initial-load bug, and add an audit timeline to Manual Entry Detail.
License Review Queue, Software Master, Device Type Master, and Approved PDF proof remain untouched
and out of scope, as does all Milestone 3 work.

#### 1. Currency soft-revert to THB-only
- **Reason**: no confirmed USD use case in current PMO workflow; multi-currency added unnecessary
  complexity across Budget & Spend, Actual Spend, PDF, Export, Forecast, and downstream modules.
- `app.js` — `SUPPORTED_CURRENCIES` is now `['THB']` (was `['THB', 'USD']`), so
  `validateActualSpendRecord()`/`validateBudgetPoolRecord()` reject `'USD'` again.
- `index.html` — the Create Memo currency selector (`#f-currency`, THB/USD) is removed. No user-facing
  UI can select or display USD anywhere in the app.
- **Soft revert, not a hard revert**: nothing downstream of validation/UI was deleted. `views/create.js`'s
  currency-aware call sites (`collectMemoData()`, `applyDraftEdit()`, `currentCurrencySymbol()`),
  `money()`, `actualSpendFromMemo()`'s currency propagation, `memoToDb()`/`dbToMemo()`'s `currency`
  mapping, and the `memos.currency` column (migration `20260703160000`) are all unchanged and stay
  dormant — every new memo simply always writes/reads `'THB'` now. This keeps a later re-enable (if a
  confirmed USD use case appears) a small, low-risk change.
- **Docs updated so code and source-of-truth no longer contradict each other**: `docs/SYSTEM_OVERVIEW.md`
  §3.4, `docs/MEMO_LIFECYCLE.md` §14, and `docs/SYSTEM_STATE_MACHINE.md` §14 now state THB-only with a
  dated decision note (2026-07-03) instead of "must support THB and USD". `docs/IMPLEMENTATION_ROADMAP.md`
  (Milestone 2 scope line) and `docs/RELEASE_PLAN.md` (v0.8.1 row) updated to match.
  `docs/TECHNICAL_DEBT.md`: TD-M2-01 items 2–3 (PDF currency wording, Manual Expense/Budget Pool
  currency selector) marked MOOT — both were only problems for a reachable USD path, which no longer
  exists; new TD-M2-02 documents the revert decision itself (CLOSED).

#### 2. Budget Pool / Budget Settings initial loading fix
- **Bug**: `renderBudgetSettings()` only ever read the synchronous local/localStorage pool cache
  (`loadBudgetPools()`). That cache stays empty/stale until some other tab (Budget vs Actual) happens
  to call `loadBudgetPoolsAsync()` first in the same session — `initApp()`'s startup preload never
  included Budget Pools either. A user who opened Budget Settings first (fresh session, fresh browser)
  saw empty/stale data even though real pools existed in Supabase.
- **Fix**: `views/budget.js` — `renderBudgetSettings()` is now `async` and calls
  `await loadBudgetPoolsAsync()` before rendering, mirroring the fetch pattern Budget vs Actual and
  Actual Spend already use. Verified live in-browser: navigating straight to Budget Settings now fires
  a fresh `GET .../budget_pools` request and renders the current Supabase data, not a stale cache.

#### 3. Manual Entry audit timeline
- **Gap**: Manual Entry Detail showed only flat `Created By` / `Created Date` / `Updated At` fields —
  no chronological history, unlike Memo Detail's "Audit Log" block (date, actor — action, optional
  comment, in a bordered box).
- `views/budget.js` — new `manualExpenseAuditTimelineHtml()`/`manualExpenseAuditTimeline()`, styled to
  match Memo Detail's existing Audit Log block exactly (same layout: bordered box, date + "actor —
  action" + optional comment). `showManualEntryDetail()` now passes this as the modal's `details` block,
  in addition to the existing flat Audit fields (nothing removed).
- `saveManualExpenseAsync()` now appends a `Created`/`Edited` entry to the record's `auditLog` on every
  save (centralized in the single write path shared by the Add/Edit modal and Excel-import promotion).
  `voidManualExpenseAsync()` now appends a `Voided` entry with the void reason as its comment.
- **Legacy records** (saved before this feature existed, no `auditLog`) get a **minimal timeline
  synthesized** from their existing `createdAt`/`createdBy`, `updatedAt`/`updatedBy` (only if actually
  different from `createdAt`), and `voidedAt`/`voidedBy`/`voidReason` fields — verified live in-browser
  against a real pre-existing manual expense record, which correctly showed a synthesized
  Created → Edited timeline.
- `manualExpenseFromDb()`/`manualExpenseToDb()` map the new `auditLog`/`audit_log` field.
- New additive migration `supabase/migrations/20260703170000_manual_expense_audit_log.sql`:
  `budget_manual_expenses.audit_log jsonb not null default '[]'::jsonb`. Both write paths
  (`saveManualExpenseAsync()`, `voidManualExpenseAsync()`) catch a missing-column PGRST204 error
  specifically (`isMissingAuditLogColumnError()`, mirroring the existing `vendor_program` fallback) and
  retry once without `audit_log`, so Create/Edit/Void keep persisting their other fields to Supabase
  even before the migration is applied — only the audit trail itself stays local-only until then.
  Documented as TD-M2-03.

#### Tests
- `tests/financial-models.test.js`: the two currency-validation tests now assert USD is **rejected**
  (was: accepted) for both Actual Spend and Budget Pool records.
- `tests/workflow.test.js`: replaced the two Milestone 2 currency-selector tests with assertions that
  `#f-currency`/any `option value="USD"` no longer exists in `index.html`, and that
  `SUPPORTED_CURRENCIES` is THB-only in `app.js`.
- `tests/budget-expenses.test.js`: 2 new tests pin the Budget Settings loading fix (fetches Supabase
  data on first render; source-level regression pin that `renderBudgetSettings()` is `async` and awaits
  `loadBudgetPoolsAsync()`). Updated 4 existing `renderBudgetSettings()` tests to `await` the now-async
  call. 12 new tests cover the Manual Entry audit timeline: `auditLog`/`audit_log` round-trip,
  Created/Edited/Voided entry appending and history preservation, real-vs-synthesized timeline
  selection, the synthesized Created/Edited/Voided shape (and that no phantom Edited entry appears when
  a record was never actually edited), `showManualEntryDetail()` wiring, and PGRST204 schema-lag
  fallback behavior for both `saveManualExpenseAsync()` and `voidManualExpenseAsync()` (including that
  an unrelated Supabase failure is still not swallowed).
- Full suite: `node --test tests/*.test.js` — **344/344 passing** (was 331; net +13 new/replaced tests
  across the three areas above). `node --check` clean on `app.js`, `views/create.js`, `views/budget.js`,
  and all touched test files.
- Manually verified in-browser against live Supabase data: Create Memo's SL form has no currency field
  and its running total shows `฿` only; navigating directly to Budget Settings (without visiting Budget
  vs Actual first) fires a live `budget_pools` fetch and renders current pool data; Manual Entry Detail
  for a real pre-existing record shows a synthesized "Created → Edited" Audit Timeline block. No console
  errors in any of the three flows.

#### Remaining / deferred
- TD-M2-03 (new): the `audit_log` migration is not yet applied to the live Supabase project — same
  accepted deployment-prerequisite shape as every prior migration in this repo.
- Everything else explicitly out of scope for this follow-up (per instruction): License Review Queue,
  Software Master, Device Type Master, Approved PDF proof of approval, and all Milestone 3 work.

### Milestone 2 — Financial Foundation (2026-07-03)

Source: `docs/IMPLEMENTATION_ROADMAP.md` Milestone 2, following Milestone 1 (accepted) and its
hotfixes. Scope: THB/USD currency, Bangkok timezone display, Created By/Updated By metadata, and
Budget tag audit logging. License Review Queue, Software Master, Device Type Master, Approved PDF
proof of approval, Resource module, Auth/permission, and Notification are explicitly out of scope
and untouched. No FX conversion is implemented and no existing financial calculation logic changed.

#### Task 2.1 — THB/USD currency support
- `app.js` — new `SUPPORTED_CURRENCIES = ['THB', 'USD']`. `money(n, currency='THB')` is now
  currency-aware but 100% backward compatible — every existing call site that omits `currency` keeps
  returning the same `฿`-prefixed string as before; passing `'USD'` returns `$`-prefixed, never `฿`.
  `validateActualSpendRecord()`/`validateBudgetPoolRecord()` now accept THB or USD instead of
  hard-rejecting anything but THB. `actualSpendFromMemo()` now propagates `memo.currency` instead of
  hardcoding `'THB'`, so an approved USD memo produces a USD Actual Spend record.
- `views/create.js` — new currency selector (`#f-currency`, THB/USD, defaults to THB) added to the
  Create Memo form (`index.html`). `collectMemoData()` collects it; `validateMemo()` rejects an
  unsupported value. The SL/HW/INT/DEP running-total displays (`calcSL`/`calcHW`/`calcINT`/
  `calcDepRow`/`calcDepGrand`) now use a currency-aware symbol instead of a hardcoded `฿`, refreshed
  live via `onCurrencyChange()`. `applyDraftEdit()` restores the memo's currency on Re-edit/Duplicate.
- `memoToDb()`/`dbToMemo()` map `currency` to/from the DB, defaulting to `'THB'` for legacy memos.
- Not changed (documented in `docs/TECHNICAL_DEBT.md` TD-M2-01): the PDF template's Thai sentence
  generation and the Manual Expense/Budget Pool/bulk-import paths remain THB-only-by-default — see
  Technical Debt for the reasoning.

#### Task 2.2 — Bangkok timezone
- `app.js` — new shared `bangkokParts(d)` (backed by `Intl.DateTimeFormat` with
  `timeZone: 'Asia/Bangkok'`) is the single source of truth for extracting date/time components for
  display, replacing viewer-local `getDate()`/`getMonth()`/`getFullYear()`. `thaiDate()`, `shortDate()`,
  and `todayISO` (via new `bangkokTodayISO()`) now route through it — business-facing dates/timestamps
  display in Bangkok time regardless of the viewer's own browser/OS timezone. `dateInput()`/`fmtDate()`
  now anchor a date-only value at UTC midnight (not viewer-local midnight) so the Bangkok extraction
  always resolves to the calendar day the user actually picked, for every viewer everywhere.
- `views/pending.js` (request time in the Pending list) and `views/budget.js`
  (`formatActualSpendDateTime()`, used for Manual Expense/Actual Spend timestamps) now pass
  `timeZone: 'Asia/Bangkok'` to their existing `toLocaleDateString`/`toLocaleTimeString` calls —
  same visual format as before, corrected timezone. History/License/Device already inherit the fix
  through the shared `shortDate()` helper; no separate changes were needed there.
- No stored timestamp changed — this is a display-only fix.

#### Task 2.3 — Created By / Updated By metadata
- **Memo**: `memoToDb()`/`dbToMemo()` map `created_by`/`updated_by`. `saveMemoAsync()` stamps
  `createdBy` on first save (preserved on every later save) and `updatedBy` on every save.
  `updateMemoStatusAsync()` stamps `updatedBy` with the acting user on every status transition
  (approve/reject/cancel/void/PMO override).
- **Device**: `deviceToDb()`/`dbToDevice()` map `created_by`/`updated_by` (and `deviceToDb()` now also
  forwards `created_at`, which it previously dropped). `saveDevice()` (Add/Edit Device modal) stamps
  both; PO-arrival auto-created devices (`markArrived()`) stamp both too.
- **Purchase Order**: `poToDb()`/`dbToPo()` map `created_at`/`created_by`/`updated_by` (previously
  `poToDb()` sent neither `created_at` nor any actor field). Auto-creation on memo approval
  (`createPurchaseOrdersFromMemo()`) and arrival updates (`markArrived()`) both stamp an actor.
- **Budget Pool**: the in-memory record shape (`createBudgetPoolRecord()`) already computed
  `createdBy`/`updatedBy`/`createdAt`/`updatedAt` correctly, but `savePoolAsync()` never forwarded
  them to Supabase (only `updated_at` was sent) — fixed. `saveBudgetPool()` (the Add/Edit Pool modal)
  now preserves the existing pool's `createdBy` on edit and stamps `updatedBy`, mirroring the working
  Manual Expense pattern (`saveManualExpenseFromModal()`, unchanged, already correct).
- **Manual Spend / Actual Spend**: already fully implemented before this milestone — no changes.
- **License**: deferred, per instruction — see `docs/TECHNICAL_DEBT.md` TD-M2-01 item 4.

#### Task 2.4 — Budget tag audit log
- `app.js` — `appendAuditLog()` gained two additive, optional fields (`previousBudgetPoolId`,
  `newBudgetPoolId`), generic enough for reuse by any future "value changed" audit event. Every
  existing caller/field is unchanged.
- `views/history.js` — `saveBudgetTag()` now captures the previous tag (via the existing
  `getEffectiveBudgetSource()` helper) before overwriting it, then writes a `'Budget tag changed'`
  audit log entry (previous tag, new tag, actor, timestamp) via the shared `appendAuditLog()` helper,
  in the same `storeMemos()` write as the tag change itself. The tagging business logic (pool
  selection, cross-year/cross-project guards, auto vs. manual resolution) is completely unchanged.

#### Tests
- `tests/financial-models.test.js`: 9 new tests — USD/THB accepted and an unsupported currency
  rejected for both Actual Spend and Budget Pool validation; `money()` currency-awareness and
  backward compatibility; `actualSpendFromMemo()` currency propagation; memo currency round-trip;
  Bangkok-anchored `shortDate()`/`thaiDate()`/`dateInput()`/`bangkokTodayISO()` correctness against
  known UTC instants.
- `tests/workflow.test.js`: 10 new tests — currency collection/validation/display/restore wiring in
  Create Memo; `saveMemoAsync()`/`updateMemoStatusAsync()` Created By/Updated By stamping and
  memo-level round-trip; Device/Purchase Order/Budget Pool metadata-stamping call sites; the Budget
  tag audit entry (both the generic `appendAuditLog()` capability and `saveBudgetTag()`'s wiring,
  including that it runs before the same `storeMemos()` write and leaves the tagging guards intact).
- Full suite: **331/331 passing** (was 312), zero regressions.
- Manually verified in-browser: switching the currency selector live-updates a Hardware memo's
  running total symbol (฿ → $) with no page reload; the currency survives Save Draft → Re-edit
  end-to-end; tagging a completed memo to a new Budget Pool writes a real audit log entry with the
  correct previous/new pool, actor, and timestamp. No test data reached the shared Supabase project.

#### Technical debt
- New `docs/TECHNICAL_DEBT.md` TD-M2-01: migration-not-yet-applied deployment prerequisite (same
  shape as TD-M1-03/TD-M1-04), plus four documented, intentionally deferred scope items (PDF currency
  wording, Manual Expense/Budget Pool currency selector, License metadata, a few secondary Device/PO
  write paths).

### Hotfix — Void Evidence UI (2026-07-03)

Small hotfix before Milestone 2: the Void Memo modal asked PMO users to paste a URL for evidence,
which is not acceptable for the PMO workflow (reason required, evidence optional, file-based when
supported, never "paste a URL"). Void lifecycle logic, Draft Restore logic, and the data model are
untouched.

#### Changed
- `views/history.js` — `openVoidModal()`'s evidence field is now an optional `<input type="file"
  accept="image/*,.pdf">` with a preview and a hidden field, replacing the visible `<input
  placeholder="URL ของไฟล์หลักฐาน">` text box. New `handleVoidEvidenceUpload()` reuses the existing
  optional-evidence upload pattern already shipped for Approve/PMO-Override evidence
  (`handleApproveEvidenceUpload`/`handlePmoEvidenceUpload` in `views/pending.js`): 5MB cap, converts
  the file to a base64 data URL via `FileReader`, clears the stored value when no file is chosen. No
  new storage architecture — this is the same mechanism already used elsewhere in the app.
- `confirmVoidMemo()` and `voidMemoAsync()` are unchanged: `confirmVoidMemo()` still just reads
  whatever string ends up in `#void-evidence-url`, so it doesn't need to know or care whether that
  string came from a pasted URL or an uploaded file.

#### Tests
- `tests/workflow.test.js`: 3 new tests — the Void modal no longer has a URL text input and has the
  file-upload markup instead; `handleVoidEvidenceUpload()` matches the established 5MB/base64/clear-on-
  no-file pattern; `confirmVoidMemo()`/`voidMemoAsync()` are structurally unchanged by the swap. Full
  suite: **312/312 passing** (was 309).
- Manually verified in-browser: Void modal renders a file picker (no URL box), selecting a PDF shows
  a "✓ แนบแล้ว" confirmation and populates the hidden field with a `data:application/pdf;base64,...`
  URL, matching what `voidMemoAsync()` already expects to receive.

### Hotfix follow-up — saveDraft() console error on navigation (2026-07-03)

Small regression found immediately after the Memo Detail Restore hotfix below: every Save Draft threw
`ReferenceError: Can't find variable: switchPendingTab` in the console, because that function was
called but never existed anywhere in the codebase. Drafts have lived in All Memos (`views/history.js`)
since an earlier milestone (per the existing "Draft management is handled in All Memos" note in
`views/pending.js`), and the real tab-switch function there is `switchHistTab(status)`, not
`switchPendingTab`.

#### Fixed
- `views/create.js` — `saveDraft()` now navigates to the History view (`swView('history', ...,
  'All Memos')`) and calls `switchHistTab('draft')` (guarded with a `typeof` check) instead of the
  undefined `switchPendingTab('drafts')`. Draft persistence and Memo Detail Restore logic are
  untouched.

#### Tests
- `tests/workflow.test.js`: added a test asserting `switchPendingTab` does not appear anywhere in the
  codebase and that `saveDraft()` calls `swView('history', ...)` + `switchHistTab('draft')`. Full
  suite: **309/309 passing** (was 308).
- Manually verified in-browser: Save Draft no longer logs any console error, lands on All Memos with
  the Draft tab active, and the just-saved draft is visible there.

### Hotfix — Memo Detail Restore (Save Draft → Re-edit / Duplicate lost detail rows) (2026-07-03)

Critical hotfix, out of milestone sequence, per explicit instruction: pause before Milestone 2 and
fix confirmed data loss on Save Draft → Re-edit and Duplicate. No Milestone 2 work started; Void,
Draft soft delete, Currency, and License Review Queue are untouched; no data model redesign.

#### Root cause
`applyDraftEdit()` (`views/create.js`) — the function that repopulates the Create form for both
"Save Draft → Re-edit" (`editDraft()`) and "Duplicate" (`duplicateMemo()`/`reeditRejectedMemo()`) —
only ever restored header fields and approvers. It never restored any memo-type-specific detail
(SL/HW rows, the SL account table, INT participant names, DEP line items, dates), so those sections
rendered empty and a subsequent Save/Submit collected blank data over the original, silently
overwriting it. Two contributing gaps made this worse:
- Hardware rows, the SL account table, INT participant names, and DEP line items were only ever
  rendered into the read-only `sections` HTML blob (for print/history), never captured as structured
  data — so they could not have been restored even with populate code in place.
- `collectMemoData()` stores every date field via `dateInput()`, which renders a print-ready Thai
  Buddhist-calendar string (e.g. `"3 กรกฎาคม พ.ศ. 2569"`), not ISO. Assigning that string directly to
  an `<input type="date">` is silently rejected by the browser, so even the one date field
  `applyDraftEdit()` did attempt to restore (`f-signdate`) rendered blank.
- Separately, `applyDraftEdit()` auto-generated a preview Memo Number (`setNextMemoNo()`) whenever the
  restored Memo Number was blank — which is every Duplicate, since `draftFromMemo()` intentionally
  blanks it — violating "Do not auto-fill or generate a preview memo number."

#### Fixed
- `views/create.js` — `collectMemoData()` now also captures raw structured copies of Hardware rows
  (`hwItems`, `hwOwner`), the SL account table (`acctCols`, `acctRows`), INT participant names
  (`intNames`), and DEP line items (`depItems`), alongside the existing HTML `sections` render.
- `views/create.js` — new `populateMemoTypeDetail(memo)`, called from `applyDraftEdit()`, rebuilds
  the Software/Hardware/Internal/Entertainment/Deployment sections (rows, account table, per-type
  fields, amount-in-words) from the restored memo object and re-triggers the existing
  `calcSL()`/`calcHW()`/`calcINT()`/`calcDepGrand()`/`calcDepRow()` functions so totals recalculate
  from source data — no total is ever patched directly.
- `views/create.js` — new `thaiDateToISO()` reverses `dateInput()`/`thaiDate()` so a saved date can be
  written back into an `<input type="date">`. Applied to the memo date, sign date, INT activity date,
  ENT event date, and DEP start/end dates on Re-edit/Duplicate.
- `views/create.js` — `applyDraftEdit()` no longer calls `setNextMemoNo()`; a blank Memo Number
  (Duplicate/Re-edit-rejected) now stays blank as required. `setNextMemoNo()` is still used for a
  genuinely brand-new memo (`resetMemoForm()`), which is unaffected.
- `app.js` — `memoToDb()`/`dbToMemo()` map the new fields to/from snake_case DB columns
  (`hw_items`, `hw_owner`, `acct_cols`, `acct_rows`, `int_names`, `dep_items`).
- `supabase/migrations/20260703150000_memo_detail_restore.sql` — additive-only migration adding the
  six new `jsonb`/`text` columns above.

#### Tests
- `tests/workflow.test.js`: 17 new tests — memoToDb/dbToMemo round-trip for Software (slItems,
  account table), Internal (activity/date/headcount/per-person amount/names), Hardware
  (hwItems/owner), and Deployment (line items) detail; Save Draft → Re-edit and Duplicate preserve
  that detail through `draftFromMemo()`; Duplicate leaves Memo Number blank and clears every
  lifecycle/audit field while keeping business detail; existing approved/completed duplicate behavior
  remains valid; `populateMemoTypeDetail()`/`collectMemoData()` structural checks (including the
  no-direct-total-patch guarantee); `thaiDateToISO()` round-trip and its four call sites;
  `setNextMemoNo()` no longer reachable from `applyDraftEdit()`. Full suite: **308/308 passing**
  (was 291).
- Manually verified in-browser for Software (rows + account table + totals), Internal (fields +
  participant names + dates), Hardware (rows + owner), and Duplicate (Memo Number blank, detail
  restored) — see report for detail.

### Milestone 1B correction — soft-deleted Drafts no longer block memo number reuse (2026-07-03)

Business rule correction to Milestone 1B: a soft-deleted Draft is deleted from the user's
perspective, so it must not block reuse of its memo number, even though its `status` is still
literally `'draft'`. No other lifecycle behavior changed.

#### Changed
- `submitMemo()`'s uniqueness pre-check (`views/create.js`) now fetches `deleted` alongside
  `memo_no`/`status` and excludes any row with `deleted: true` from `MEMO_NO_BLOCKING_STATUSES`
  blocking — a soft-deleted Draft's memo number is now reusable, same as Rejected/Cancelled.

#### Tests
- `tests/workflow.test.js`: added a test confirming the uniqueness check selects `deleted` and
  excludes deleted rows from blocking. Full suite: **291/291 passing** (was 290).

#### Technical debt
- `docs/TECHNICAL_DEBT.md` TD-M1-03 item 3 ("Deleted Drafts still block memo-number reuse") is
  resolved by this change.

### Milestone 1B — Memo-side Void lifecycle + Draft soft delete (2026-07-03)

Source: `docs/IMPLEMENTATION_ROADMAP.md` Milestone 1, continuing from Milestone 1A. Scope locked by
the business decisions in this session: Void (reason required, evidence optional), Draft soft delete,
memo-number reuse allowed only for Rejected/Cancelled, and no blind baseline-schema migration.
Currency, Timezone, cross-module Created/Updated metadata, License Review Queue, Software Master,
Device Type Master, Approved-PDF proof-of-approval, and soft delete for devices/licenses/budget pools
are explicitly out of scope and untouched.

#### Void (memo-side lifecycle)
- New `voidMemoAsync(memoNo, reason, evidenceUrl)` (`app.js`): PMO/Admin-only, only from `completed`,
  reason required, evidence optional. Blocked with the exact MEMO_LIFECYCLE.md §12 warning text when
  a Device Registry record already exists for the memo (`memoHasIrreversibleDownstreamRecords()` —
  checks `loadDevices()` for any row whose `memoNo` matches; a Purchase Order alone does not block,
  matching the doc's allowed/not-allowed examples). Writes an audit log entry via the shared
  `appendAuditLog()` helper, then transitions status to the new `'voided'` literal, storing
  `voidedAt`/`voidedBy`/`voidReason`/`voidEvidenceUrl`.
- `updateMemoStatusAsync()`'s terminal-state guard now explicitly allows `completed → voided` as its
  own guarded transition (`isVoiding`), separate from the PMO Override bypass — Void does not trigger
  Milestone 1A's override-specific approver-marking logic, since Void doesn't touch approver steps.
- `syncMemoToActualSpend()` (unchanged code) already treats any non-`completed` status as
  "remove the Actual Spend record" — Voided is automatically excluded from Budget & Spend Actual
  totals with zero new code.
- `parseLicenseFromMemo()`/`getAllLicenses()` (`views/license.js`, unchanged code) already gate on
  `status === 'completed'` — memo-derived license rows from a Voided memo are automatically excluded,
  with zero new code. Regression-pinned with a test so this can't silently drift.
- `views/history.js`: `openHistoryDetail()` now shows a PMO-only "⊘ Void" action for `completed`
  memos (opens a new lightweight `openVoidModal()`/`confirmVoidMemo()` pair — reason textarea
  required, evidence URL input optional, no approver editing). The existing Duplicate action now also
  covers Voided memos. A Voided memo remains visible in All Memo/History (only the `deleted` flag,
  not `voided` status, is filtered from views).
- `histStatusLabel`/`histStatusBadgeClass` (`app.js`) gained a `voided` entry (`'Voided'` /
  `badge-gray`). The existing `completed` ⇄ Approved internal mapping is unchanged.
- `draftFromMemo()` (`app.js`) now clears `voidedAt`/`voidedBy`/`voidReason`/`voidEvidenceUrl` (and
  `deleted`/`deletedAt`/`deletedBy`/`deleteReason`) so a duplicated memo never inherits its source's
  Void or soft-delete metadata.

#### Draft soft delete
- `deleteDraft()` (`views/history.js`) no longer filters the local array. It now writes an audit log
  entry (`Deleted Draft by <user>`) and calls `updateMemoStatusAsync(memoNo, 'draft', {deleted:true,
  deletedAt, deletedBy})` — status stays `'draft'` (deletion is a flag, not a status transition, per
  SYSTEM_OVERVIEW.md §6), reusing the existing Supabase-sync/cache-update pipeline instead of a
  parallel implementation. Guarded to only ever act on `status === 'draft'`.
- `loadMemos()`/`loadMemosAsync()` (`app.js`) now filter out `deleted: true` records at the single
  shared read path — this covers Pending/History/Budget/License/Device/Dashboard at once, no
  per-view changes needed. No recycle bin; a soft-deleted Draft is retained in Supabase/localStorage
  with its deleted metadata but excluded from every normal read.

#### Memo number reuse
- `submitMemo()`'s uniqueness pre-check (`views/create.js`) now blocks on an explicit
  `MEMO_NO_BLOCKING_STATUSES` set (`draft`, `pending`, `pending_a2`, `pending_a3`, `completed`,
  `voided`) instead of the old `status !== 'rejected'` check — Cancelled now also allows reuse (it
  didn't before), matching the locked decision. No new warning/confirmation dialog was added for the
  Rejected/Cancelled reuse case, per the explicit instruction not to add one.

#### Schema
- New migration `supabase/migrations/20260703140000_memo_void_and_soft_delete.sql`: additive
  `alter table public.memos add column if not exists ...` for the eight new fields above. Per the
  locked decision, no blind baseline-schema migration was attempted (see `docs/TECHNICAL_DEBT.md`
  TD-M1-01, still open, unchanged this milestone).

#### Tests
- `tests/workflow.test.js`: added 17 new tests covering Void (success with/without evidence, reason
  required, PMO-only, invalid-status rejection for every non-completed status, remains visible after
  voiding, duplicable with cleared metadata, excluded from Actual Spend, audit log shape), the Device
  downstream guard (blocked when a device row exists, allowed when only a PO exists), a pinning test
  confirming License exclusion still works via unchanged `status==='completed'` gates, Draft soft
  delete (metadata stored, disappears from `loadMemos()`, stays hidden after a simulated
  `loadMemosAsync()` refetch), and the memo-number reuse blocking-set contents. Several of the
  History/create.js-side checks are static source-regex assertions (matching this test suite's
  existing convention for DOM-heavy view code) rather than full DOM-driven runs.
- Full suite: `node --test tests/*.test.js` — **290/290 passing** (was 273; net +17 new tests).
- `node --check` on `app.js`, `views/history.js`, `views/create.js`, `tests/workflow.test.js` — all
  clean.
- Manual verification (real browser, static server, real seeded data): voided an Approved SL memo
  end-to-end (`voidMemoAsync` called directly and via the UI modal) — confirmed `status`→`voided`,
  audit log entry recorded, still visible in All Memo with a "Voided" gray badge, excluded from
  `loadActualSpendRecords()` and `getAllLicenses()`. Soft-deleted a real Draft — confirmed it
  disappears from `loadMemos()` immediately. No console errors in either flow.

#### Not changed (explicitly out of scope for Milestone 1B)
- Currency, Timezone, cross-module Created/Updated metadata, License Review Queue, Software Master,
  Device Type Master, Approved-PDF proof-of-approval, and soft delete for devices/licenses/budget
  pools — all remain TODO for later Milestone 1 sub-phases or later milestones per
  `docs/IMPLEMENTATION_ROADMAP.md`.

### Milestone 1A — Core Lifecycle Foundation: schema review, shared audit helper, approval-step literals, status vocabulary consolidation (2026-07-03)

Source: `docs/IMPLEMENTATION_ROADMAP.md` Milestone 1, Tasks 1.1–1.4. Scope explicitly excludes Void,
Soft Delete, Currency, and License Review Queue — those remain TODO for later Milestone 1 sub-phases.

#### Task 1.1 — Baseline schema / memo number uniqueness review
- Documentation-only. No schema or migration files changed (no live Supabase access available to
  safely generate a baseline `create table` migration blind).
- Confirmed and documented in `docs/TECHNICAL_DEBT.md` (new entry **TD-M1-01**): no committed
  baseline migration exists for `memos`, `user_profiles`, `devices`, or `purchase_orders`; no
  database-level `unique` constraint on `memos.memo_no` (enforcement today is a client-side
  pre-check in `submitMemo()` only).
- New finding from this review: that pre-check does not block reusing a memo number belonging to a
  previously **Rejected** memo — flagged as a possible undocumented gap against MEMO_LIFECYCLE.md
  §5, not fixed (business-rule decision, out of this task's review-only scope).

#### Task 1.2 — Shared audit helper
- Moved `appendAuditLog()` from `views/pending.js` into `app.js` as the single source of truth (no
  behavior change — same signature, same fields). `views/pending.js`'s four existing call sites
  (Reject, PMO Override, PMO Edit Approvers, Cancel) are unchanged and continue to work via global
  scope now that `app.js` loads first.

#### Task 1.3 — Approval-step literal statuses: `bypassed` / `overridden`
- `prepareMemoForSubmission()` (`app.js`): an A1 self-review (requester is also A1) now records
  approver status `'bypassed'` instead of `'approved'`. `selfReviewed: true` is unchanged for
  backward compatibility.
- `updateMemoStatusAsync()` (`app.js`): a PMO override that results in `'rejected'` now marks the
  step PMO acted on as `'overridden'` (with `overriddenAt`/`overriddenBy`/`overrideNote`) instead of
  `'rejected'` — the approver didn't reject it, PMO did, with evidence. A genuine non-override reject
  path is unchanged.
- `confirmPmoOverride()` (`views/pending.js`): the approver-edit-row reconstruction now marks only
  the one step whose turn it currently is as `'overridden'` (previously silently reset to
  `'pending'` like every other not-yet-reached step, per audit finding G-12).
- Added `isApproverStepResolved(status)` (`app.js`): treats `approved`/`bypassed`/`overridden` as
  equivalently "resolved/locked" for display purposes. Applied to every UI site that previously
  checked `status === 'approved'` alone (`views/pending.js`'s override-modal preview rows,
  Edit-Approvers modal rows, and the "keep already-resolved entries intact" guards in both modals;
  `app.js`'s PDF approval-signature loop keeps `bypassed` — but not `overridden` — eligible for a
  signature, matching what was captured before this change) so existing approved-look rendering is
  unchanged, and a previously-resolved step is never silently reset back to `pending` on a later edit.
- `views/history.js`'s memo-detail approvers timeline (`_buildMemoApproversTimeline`) now renders
  distinct "Bypassed (Self-review)" and "Overridden by PMO" labels/colors instead of collapsing them
  into Approved or Pending.
- Existing data already stored as `status:'approved', selfReviewed:true` (created before this change)
  continues to render and behave exactly as before — `isApproverStepResolved` and the PDF check both
  still include `'approved'`. No data migration needed or performed.

#### Task 1.4 — Shared status/badge vocabulary consolidation
- Moved `memoStatusKey()`, `histStatusLabel()`, `histStatusBadgeClass()` from `views/history.js` into
  `app.js` as the single source of truth (behavior-preserving relocation only — `views/budget.js`'s
  existing `memoStatusKey()` calls are unaffected since these were already globally scoped).
- `views/pending.js`'s separate inline status pill (different visual system — inline hex styles, not
  `badge-*` classes — and a different display intent, showing the dynamic current-approval-stage
  rather than a fixed label) was deliberately left as-is rather than force-merged, to avoid a visible
  UI change outside this task's scope. Documented as **TD-M1-02** in `docs/TECHNICAL_DEBT.md`, to be
  resolved before or alongside the Void feature (the next milestone to introduce a new memo status).

#### Tests
- `tests/workflow.test.js`: updated the existing self-bypass test's expected status (`approved` →
  `bypassed`); added coverage for `appendAuditLog`'s relocation and behavior, `isApproverStepResolved`
  for all four literal values, PMO-override-to-rejected producing an `overridden` step (not
  `rejected`), a non-override reject's existing short-circuit behavior confirmed unchanged, and the
  relocated `memoStatusKey`/`histStatusLabel`/`histStatusBadgeClass` covering every known memo status.
- Full suite: `node --test tests/*.test.js` — **273/273 passing** (was 265; net +8 new/updated tests).
- Manual verification (real browser, static server): Create Memo, Pending Approval (37 items), and
  History (111 items, status counts Draft 1/Pending 37/Approved 62/Rejected 9/Cancelled 2) all render
  with no console errors. Confirmed live in-page that `isApproverStepResolved`,
  `histStatusLabel`/`histStatusBadgeClass`, and `appendAuditLog` are correctly defined once in
  `app.js`, and that a synthetic memo with `bypassed`/`overridden`/`pending` approver steps renders
  the three distinct timeline labels correctly.

#### Not changed (explicitly out of scope for Milestone 1A)
- Void lifecycle, Soft Delete, Currency (THB/USD), License PMO Review Queue — all remain TODO for
  later Milestone 1 sub-phases per `docs/IMPLEMENTATION_ROADMAP.md`.
- S-03 (Edit Approvers evidence classification): reviewed against the current decision (PMO
  administrative correction, not Override-equivalent — reason required, evidence optional, audit
  logged) — `confirmPmoEditApprovers()` already satisfies this exactly as written (reason required,
  no evidence field, `appendAuditLog` called). No code change was needed.

---

### Phase 7A-11 — Overview Canonicalization (TD-7A-03) (2026-07-02)

#### Changed
- Overview's Budget KPI card and Section B ("per-project Budget vs Actual bars") no longer read the legacy `loadSLBudgets()` store. Both now go through a new shared helper, `_ovCanonicalDataset()` (`views/budget.js`), which calls the exact same `calculateBudgetVsActualDataset()` engine the Budget vs Actual tab uses, scoped to the current BE year (Overview has no year selector).
- `_ovUpdateKPIs()`: `annualBudget` is now `_ovCanonicalDataset().rows` filtered to Overview's active Project chips, summed by `row.budget` — replacing `loadSLBudgets()?.[currentYear][project]`. The existing month-range proration (`annualBudget / 12 * numMonths`) is unchanged.
- `_ovRenderBvA()`: builds a `poolBudgetByProject` map from the same canonical dataset instead of `loadSLBudgets()?.[currentYear]`.
- Updated two Thai UI label strings that named the old source ("งบ SL ตั้งไว้" → "งบจาก Budget Pool"; the Section B formula note's "Budget Settings" → "Budget Pool") and fixed a pre-existing dead link (`switchBudgetTab('sl-infra')` — not a real tab id — → `switchBudgetTab('bgt-settings')`) in the "no budget set yet" KPI empty state.
- Overview's Actual Spend calculation, charts (bar/donut), month-range picker, Project/Type chip UI, and layout are all unchanged — they already read canonical Actual Spend via the shared `calculateActualSpendInRange()` helper, so no duplicated aggregation existed there.
- Forecast tab (`_renderBudgetSLInfraWith()`, lines ~1147/1492) and Budget Settings still use `loadSLBudgets()` — intentionally untouched per this phase's explicit "do not change Forecast" scope boundary.

#### Unchanged (verified, not touched)
- Actual Spend, Forecast, Assignment Workspace, Bulk Upload, Health Check — no files under those features were modified.
- `calculateBudgetVsActualDataset()`, `calculateBudgetUtilization()`, `mapBudgetPool()`, and every other canonical calculation function (`app.js`) are untouched.
- `loadSLBudgets()`, `loadSLBudgetsAsync()`, `storeSLBudgets()`, `getSLBudgetForProject()` remain defined and still used by the Forecast tab and Budget Settings — not dead code, not removed.

#### Manual verification (real browser data, not just test fixtures)
- Confirmed Overview's Budget/Remaining/Utilization KPIs now derive from canonical Budget Pool data (Remaining went from the old always-nonsense figure to a real negative overage figure matching an actual over-budget Budget Pool total).
- Confirmed a residual, pre-existing (not introduced by this phase) numeric gap between Overview and Budget vs Actual on real data for "current year, all projects": Overview showed Actual ฿250,173,597 / Budget ฿125,354,721 vs Budget vs Actual's Actual ฿250,857,150 / Budget ฿125,854,721. Root-caused to two UI-model differences explicitly out of scope for this phase (Overview's rolling month-window vs. Budget vs Actual's discrete calendar-year Actual calculation; Overview's Project chips being derived only from observed Actual Spend, excluding Budget-Pool-only projects) — documented as new technical debt **TD-7A-09**, not fixed here since fixing it requires an Overview UI redesign this phase explicitly disallows.

#### Tests
- Added 4 tests to `tests/budget-expenses.test.js`: Budget KPI sourced from Budget Pool with `loadSLBudgets()` asserted to stay empty; full KPI (Budget/Actual/Remaining/Utilization) + Section B parity against `calculateBudgetVsActualDataset()` for a matching project/year (clean fixture, no Date mocking needed — the default 12-month preset is always exactly 12 months regardless of wall-clock time); chart/donut/KPI actual-total parity against the canonical dataset for the existing `seedOverview()` fixture; a static-scan regression test pinning "no remaining `loadSLBudgets(` call inside the Overview sub-tab section." Full suite: 265/265 passing (was 261; net +4).

#### Technical debt
- TD-7A-03 (`docs/TECHNICAL_DEBT.md`): CLOSED.
- TD-7A-09 (new): documents the residual rolling-window/chip-derivation gap above; explicitly deferred to a future Overview UI-design phase.

### Phase 7A-9E — Budget Pool overlap allowed (business rule update) (2026-07-02)

#### Changed
- Overlapping Budget Pools (same Project + Spend Type + Period) are now explicitly allowed. Reason: PMO may intentionally create multiple buckets with the same Project, Spend Type, and Period to separate budget purposes.
- Manual Add/Edit (`saveBudgetPool()`, `views/budget.js`): removed the `confirm()` warning dialog for overlapping Project + Spend Type + Period — an overlapping pool now saves immediately, with no prompt.
- Bulk Upload / Bulk Update (`validateBudgetPoolImportBatch()`, `app.js`): removed the `errors.push('Overlaps existing Budget Pool(s)...')` escalation — overlap no longer fails a row or blocks the workbook (all-or-nothing still applies, but only to real errors: invalid month, negative budget, unknown Pool ID, duplicate Pool ID, duplicate identity, invalid Spend Type).
- Removed the now-inaccurate "Overlapping Pool" row from the Bulk Upload workbook's Instructions sheet Common Errors table; added a short note explaining overlap is allowed by design.
- `validateBudgetPoolChange()`'s `conflicts` field is unchanged (still computed) but is no longer treated as blocking by either caller — it is informational only.

#### Unchanged (verified, not touched)
- Exact duplicate business identity (Project + Pool Name + Budget Year) still blocks in both manual add/edit and bulk import — unchanged.
- Canonical automatic mapping (`mapBudgetPool()`, `findMatchingBudgetPools()`, `app.js`) is untouched: manual override (`manualBudgetPoolId`/`finalBudgetPoolId`) is still always respected; an Actual Spend record matching exactly one pool still auto-maps (`Mapped`); a record matching more than one pool still becomes `Needs PMO Review` with no auto-pick — so allowing overlapping pools can never cause double-counting, a record still resolves to exactly one final Budget Pool or `Needs PMO Review`.
- Pool ID Create/Update decision logic, Export/Template workflow (columns, sheets, round-trip contract), and Lifecycle/Archive/Delete are all unchanged — out of scope per this update.
- `docs/BvA_REQUIREMENT.md` §8 amended in place (Phase 7A-9E note) rather than silently left contradicting the code, per that document's own "wins unless a future phase explicitly amends it" rule.

#### Tests
- Replaced the 3 tests that pinned the old overlap-blocks behavior (`tests/financial-models.test.js`, `tests/budget-expenses.test.js`) with tests confirming overlap is now accepted (manual save with no confirm, bulk Create, bulk Update, and multiple overlapping pools created together in one workbook), plus a dedicated test that exact duplicate identity still blocks. Full suite: 253/253 passing (was 248; net +5 new/replaced tests).

### Phase 7A-9D — Budget Pool Bulk Upload redesign: one workbook, Create + Update (2026-07-02)

#### Changed
- Replaced the CSV "one example row per project" Download Template with a real `.xlsx` workbook (SheetJS) containing the Budget Pools currently visible under Budget Settings' active filters (today: Budget Year), each with its real Pool ID, plus an Instructions sheet documenting the workflow and common errors.
- Bulk Upload now supports Create and Update in a single workbook: **Pool ID** (new column) is the only signal that decides Update vs. Create — a blank Pool ID always creates, a Pool ID matching an existing pool updates that exact pool. Business identity `(Project, Pool Name, Budget Year)` uniqueness is still enforced via the existing shared `validateBudgetPoolChange()`, but no longer used to infer which pool a row updates.
- Sheet 1 column order is fixed: `Pool ID, Project, Pool Name, Budget, Budget Year (BE), Start Month, End Month, Spend Types`.
- Added a true no-op "No Changes" classification: a row whose Pool ID matches an existing pool and whose every effective field is identical is neither created nor updated — no save, no audit-field change, no remap — satisfying the Download → Upload-unmodified round-trip contract.
- Preview and error modals now show Pool ID and a Created/Updated/No Changes/Errors summary; Update rows whose Period or Budget Year changed show an inline mapping-impact warning.
- `#pool-excel-upload` now accepts `.xlsx` only (previously `.xlsx,.xls`).
- Extracted `visibleBudgetSettingsPools()` (`views/budget.js`) as the single source for "what's visible under Budget Settings' active filters," shared by `renderBudgetSettings()` and Download Template, so a future filter (Project/Spend Type/Search) needs updating in one place.
- Spend Types column accepts canonical names (Software, Hardware, Team Activity, Client Expense, Deployment, Infra, Others) and legacy short codes (SL, HW, INT, ENT, DEP, plus INFRA/OTHER) — closing a pre-existing gap where bulk import could not set Infra/Others. The previous "Memo Types" header remains readable for backward compatibility. An unrecognized token now surfaces an explicit "Invalid Spend Type" row error instead of being silently dropped.

#### Fixed
- Bulk-imported Update rows now preserve the existing pool's `createdBy`/`createdAt` and only refresh `updatedBy`/`updatedAt` (previously every bulk-updated pool silently got a fresh `createdAt` and blank `createdBy`).

#### New errors
- `Unknown Pool ID`, `Duplicate Pool ID` (same Pool ID used twice in one file), and a specific "Existing Budget Pool detected, but Pool ID is blank" message (in addition to the existing generic duplicate-identity message) when a blank-Pool-ID row's identity collides with an existing pool.

#### Unchanged
- All-or-nothing validation, `validateBudgetPoolRecord()`/`validateBudgetPoolChange()` as the single validators, overlap-conflict detection, year derivation from Start/End Month, `savePoolAsync()`/batch-remap-once behavior, and every other Budget & Spend tab (Overview, Actual Spend, Forecast, Budget vs Actual). No Lifecycle/Archive/Delete/Dashboard/Health Check/Supabase changes.

#### Tests
- Added/updated coverage in `tests/financial-models.test.js` and `tests/budget-expenses.test.js` for: Pool-ID-driven Create/Update classification, Unknown Pool ID, Duplicate Pool ID, blank-ID-matches-existing-identity, Duplicate Identity after Update, No Changes (validator level and full `handlePoolBulkUpload`→`_confirmPoolImport` pipeline — no save/audit/remap), audit preservation on Update and fresh audit on Create, backward-compatible Spend Type parsing (canonical names, legacy short codes, mixed, invalid token), Download Template shape (`.xlsx`, sheet names, column order, Pool ID inclusion, year-filter scoping), the full Download→Upload-unmodified round trip, and preview/error summary counts. Full suite: 248/248 passing.

---

### Phase 7A-10 PR1 - Assignment Workspace Polish

Scope: Budget vs Actual Assignment Workspace and Budget Settings polish items identified in the
Phase 7A-10 Budget vs Actual design review. Report-only/UX fixes; no data contract, mapping, bulk
upload, or export logic changed.

#### Fixed
- `assignBudgetPoolFromWorkspace()` (views/budget.js): the Approved Memo branch now wraps the Tag
  Budget modal's save button the same way the Manual Expense branch already did, refreshing the
  Assignment Workspace once `saveBudgetTag()` reports a successful save (modal hidden). Previously
  a resolved Memo record could remain visible in Unbudgeted / Needs PMO Review until the user
  manually navigated back to Budget vs Actual.

#### Changed
- Budget Assignment Workspace status column now renders via the existing
  `actualSpendBudgetStatusBadgeClass()` badge helper instead of plain text, matching status badge
  styling used elsewhere in Budget & Spend. No new status values introduced.
- Budget vs Actual search input (`bva-search`) is now debounced (250ms) instead of triggering a full
  `reconcileActualSpendSources()` remap on every keystroke. Final rendered result for a given search
  value is unchanged.

#### Added
- Budget Settings pool list gained a simple search box (`bset-search`) filtering by Project or Pool
  Name, case-insensitively. `visibleBudgetSettingsPools()` — the single source both
  `renderBudgetSettings()` and `downloadBudgetPoolTemplate()` already read from — now applies this
  filter, so the downloaded template automatically matches the filtered visible list with no
  separate wiring needed.

#### Remaining Work
- Overview/SL+Infra legacy budget source reconciliation (TD-7A-03) — explicitly out of scope for
  this PR.
- Bulk Assign in the Assignment Workspace — deferred, higher-risk item from the same design review.

---

### Phase 7A-9C - Budget Pool Bulk Upload Validation Redesign & TD-7A-02 Closure

Scope approved after a design review (see "Phase 7A-9C — Budget Pool Management Design Review"):
Bulk Upload validation redesign (strict all-or-nothing, shared canonical validation, intra-file and
vs-existing duplicate detection, overlap/conflict detection, negative-budget sign-stripping bug fix,
preview/error report, single batch remap) and closing TD-7A-02 (Tag Budget's separate matching
implementation). Budget Pool Lifecycle (Active/Archived) was explicitly reviewed and deferred out of
this phase after discovering it cannot durably persist across users/devices without a Supabase
`status` column (Supabase is live and `loadBudgetPoolsAsync()` overwrites the local pool cache from
Supabase on every refresh) — no Supabase migration was approved for 7A-9C. Delete strategy,
Inactive status, delete-to-Unbudgeted cascade, Health Dashboard, orphan-assignment reporting, full
Project Dropdown migration, and Overview legacy budget cleanup were all explicitly out of scope.

#### Added
- `validateBudgetPoolImportBatch(rows, existingPools)` (`app.js`) — the single Bulk Upload
  validator. Reuses `validateBudgetPoolChange()` row-by-row against a context that accumulates every
  row already accepted earlier in the same batch (plus a `claimedIds` guard so two rows both
  resolving to the same *existing* pool are also caught, not just two rows creating the same *new*
  identity) — no separate validation/duplicate engine. Escalates an overlap/shared-Spend-Type
  conflict from the manual flow's confirmable warning to a hard failure, since Bulk Upload has no
  per-row "confirm through it" UI. Returns per-row `ok`/`errors`/`action` (`create`/`update`) so the
  caller can render either an error report or a preview, never both.
- `_showPoolImportErrors(rowResults)` (`views/budget.js`) — new error-report modal shown when any
  row fails validation; lists every failing row, its Project/Pool Name, and its specific reasons.
  No confirm action — the batch cannot be partially imported.

#### Changed
- **`handlePoolBulkUpload()`** (`views/budget.js`) no longer does its own field-level validation
  (project/name/budget presence) or its own numeric coercion of "valid" rows — every row is parsed
  into a plain object and handed to `validateBudgetPoolImportBatch()`. Branches to
  `_showPoolImportErrors()` if any row fails, or `_showPoolImportPreview()` only when the entire
  batch passes — there is no more partial-success path or native `confirm()` gate.
- The budget-cell parser now preserves a leading minus sign
  (`replace(/[^0-9.\-]/g,'')` instead of `replace(/[^0-9.]/g,'')`), so a negative value is rejected
  by the shared `budget > 0` check instead of silently becoming positive.
- **`_showPoolImportPreview(rowResults)`** now renders the already-validated canonical records (not
  raw parsed fields) and adds an explicit New/Update column per row, sourced from the validator's
  `action` field.
- **`_confirmPoolImport()`** now saves every row via `savePoolAsync(record, { skipRemap: true })`
  and calls `remapActualSpendForBudgetPools()` exactly once after the loop, instead of once per
  imported pool.
- **`savePoolAsync(rawPool, opts = {})`** gained an optional `opts.skipRemap` (default `false`,
  so manual add/edit behavior via `saveBudgetPool()` is unchanged); Bulk Upload is the only caller
  that passes it.
- **Tag Budget (`openBudgetTagModal()`, `views/history.js`)** no longer recomputes a memo→pool
  match. It reads the memo's own canonical Actual Spend record
  (`loadActualSpendRecords().find(r => r.memoId === memo.memoNo)`) and derives the effective/
  auto-match pool via the existing `getFinalBudgetPoolId()` (app.js) and the record's
  `autoBudgetPoolId` — closing TD-7A-02. An ambiguous multi-match memo now correctly shows no
  auto-match (`Needs PMO Review`, matching the canonical rule everywhere else in the app) instead of
  the old narrowest-pool-wins guess.

#### Fixed
- Bulk Upload no longer silently creates duplicate pools when a file contains two rows with the
  same Project/Pool Name/Year identity (case-insensitive) — the previous per-row-only duplicate
  check compared against a stale pre-import snapshot that was never refreshed as rows committed.
- A negative budget value typed in an imported spreadsheet cell is now rejected, not silently
  coerced positive by the previous sign-stripping regex.
- **Post-review manual test bug**: Bulk Upload rejected every row with "Valid start/end month or
  date range is required" even when the Start/End Month cells visibly showed valid values
  (`2026-01`, `2026-12`, `2569-01`, `2569-12`). Root cause: Excel commonly auto-converts a typed
  `"2026-01"`/`"2569-01"` cell into a real date/serial value instead of keeping it as text, so
  `XLSX.utils.sheet_to_json()` returned a raw Excel serial number (or a `Date`, depending on read
  options) for that cell — a shape `normalizeMonthValueToGregorian()` (app.js) was never designed to
  parse, unlike plain `"YYYY-MM"` text. New `excelImportMonthValue()` (`views/budget.js`, reusing the
  existing `excelImportDateParts()` Excel serial/Date decoder already used by Actual Spend import)
  decodes a serial number or `Date` to `"YYYY-MM"` (day discarded — this is a month field) before it
  ever reaches the shared validator; plain BE/CE text passes through unchanged, with
  `normalizeMonthValueToGregorian()` still doing the BE-to-CE conversion exactly as before.
  `handlePoolBulkUpload()` now reads the RAW cell value for Start/End Month (a new `getRaw()`
  helper) instead of the pre-stringified value the rest of the row parsing uses. The Budget Pool
  data contract and all-or-nothing behavior are unchanged — this only fixes what reaches the
  existing, unmodified validation path. The error report was also clarified to explicitly state
  `Import แล้ว 0 รายการ` (0 imported) and `N จาก M รายการ` (N of M rejected) alongside the existing
  all-or-nothing explanation.

#### Removed
- `matchMemoToPool()`, `autoTagBudgetPool()`, `getPoolMemos()`, `getPoolActual()` (`views/budget.js`)
  — the parallel memo→pool matching implementation behind TD-7A-02. Confirmed zero remaining callers
  (including tests) by repo-wide search before removal.

#### Tests
- `tests/financial-models.test.js`: 6 new unit tests for `validateBudgetPoolImportBatch()` (valid
  batch New/Update classification, all-or-nothing on one invalid row, intra-file duplicate,
  vs-existing duplicate using the canonical derived year, same-existing-pool-twice duplicate,
  overlap escalation, negative budget rejection) plus 4 tests (1 structural, 3 behavioral via a new
  `historyContext()` harness) proving Tag Budget reads the canonical Actual Spend result and no
  longer applies its own tie-break.
- `tests/budget-expenses.test.js`: 5 new tests covering the removed-functions check, the
  sign-preserving fix, intra-file and overlap rejection through `handlePoolBulkUpload()` end-to-end,
  and a full valid-batch import proving New/Update tagging, in-place update (no duplication), and
  exactly one remap call for a multi-row batch. Plus 9 more for the Excel Start/End Month bug fix:
  unit tests for `excelImportMonthValue()` (CE text, BE text, Excel serial number, `Date` object,
  empty/missing), end-to-end `handlePoolBulkUpload()` regression tests for the exact reported CE/BE
  text case, the serial-number case, and the `Date`-object case, and a control test proving a
  genuinely invalid row (missing Start Month entirely) still correctly reports 0 imported / N of M
  rejected with no partial import.
- Full regression suite: 230/230 passing (up from 205 before this phase; 221 before this bug fix).
- Manually reproduced the exact reported bug and confirmed the fix live in the browser (serial-date,
  CE-text, and BE-text Start/End Month cells all resolved to the same canonical `"2026-01"` →
  `"2026-12"`; a genuinely missing Start Month cell still correctly triggered the all-or-nothing
  error report with 0 pools persisted).

#### Remaining Work
- Budget Pool Lifecycle (Active/Archived), Archive-as-delete-alternative, and the DB FK
  mismatch (`budget_manual_expenses.budget_pool_id ... on delete set null` vs. the app's hard block)
  are deferred to a future phase gated on TD-7A-06 (Supabase baseline migration + schema audit).
  See `docs/TECHNICAL_DEBT.md` TD-7A-06 and the new TD-7A-08.
- Delete strategy is otherwise unchanged in this phase (still a hard block for any referenced pool).
- Health Dashboard, orphan-assignment reporting, full Project Dropdown migration (TD-7A-07), and
  Overview legacy budget cleanup (TD-7A-03) remain open and out of scope, per the design review.

### Phase 7A-9B - Budget Pool UX & Workflow (Year selector, Month picker, BE display, warnings)

Scope approved: shared BE display helper; Budget Year selectable with Start/End auto-populate;
Month picker/select redesign; Actual Spend year filter BE label; in-app Budget Pool date/month/year
display standardized to BE; duplicate/overlap warning UX improved (existing validation only); delete
messaging improved (behavior still hard-blocked). Explicitly NOT in scope: Export format change,
Archive/Active/Inactive, delete-to-Unbudgeted cascade, Supabase/persistence-model/Forecast changes —
per approved decisions.

#### Added
- `formatMonthBE()` (`app.js`) — shared display-only helper converting a Gregorian `"YYYY-MM"` (or
  full date) value to a BE-labeled `"MM/YYYY"` string (e.g. `"2026-01"` -> `"01/2569"`), matching the
  app's existing dd/mm/yyyy-BE convention. Internal storage/comparison/matching untouched.
- `populateMonthSelect(id, selectedMonth)` (`views/budget.js`) — populates a Start/End Month
  `<select>` with the 12 Thai month names (reusing the existing `MONTHS_TH` array), value 1-12.
- `_onBpoolYearChange()` / `_onBpoolStartMonthChange()` (`views/budget.js`) — wire the new Budget
  Year/Start Month selects: changing Year resets Start/End Month to January/December (the "2569 ->
  2026-01 to 2026-12" requirement); changing Start Month bumps End Month up to match if it would
  otherwise precede it, preventing an invalid range structurally rather than only at save time.

#### Changed
- **Budget Year is now user-selectable** (`bpool-year` is a `<select>`, no longer a readonly text
  input). `populateBudgetYearSelect(id, extraYear)` gained an optional `extraYear` parameter so an
  existing pool's own (possibly outside current±1) year is always representable and pre-selected,
  never silently dropped.
- **Start/End Month picker redesign**: `bpool-start`/`bpool-end` (free-text `type="month"` inputs)
  replaced with `bpool-start-month`/`bpool-end-month` (Thai month-name `<select>`s, values 1-12)
  sharing the one Budget Year select — a pool can never span multiple years (already enforced by
  `validateBudgetPoolRecord`), so one year field is sufficient for both. `saveBudgetPool()` now
  constructs Gregorian `startMonth`/`endMonth` from `financialYearToGregorian(yearBE) + '-' +
  month`, removing the free-text BE/CE ambiguity that caused the "3112" bug — there is no longer any
  typed month value to mistype.
- **In-app BE display**: Budget Settings pool list, BvA pool rows, and the Assign Budget Pool
  modal's period line now show `formatMonthBE()` output instead of raw Gregorian `YYYY-MM`.
- **Actual Spend year filter (`as-year`)**: option labels now show `ปี {BE year}` via
  `gregorianYearToBuddhistEra()`; the underlying `<option value>` stays Gregorian since
  `actualSpendRecordInYear()` compares it against `record.startDate`'s Gregorian year. The
  `as-period-label` text (display-only) was also converted to BE for consistency with the dropdown
  right next to it.
- **Overlap warning**: `saveBudgetPool()`'s conflict `confirm()` now lists each conflicting pool by
  `project / name (BE period)` instead of a bare count — still built entirely from
  `validateBudgetPoolChange()`'s existing `conflicts` data; no new validation engine.
- **Delete messaging**: `deleteBudgetPool()`'s block alert now names the pool and breaks down
  reference counts by source (`Actual Spend N รายการ` / `Manual Expense N รายการ` / `Memo N
  รายการ`) instead of one bare total; the no-blocker confirm now also names the pool. **Behavior is
  unchanged** — deletion remains fully blocked whenever any reference exists. Delete-to-Unbudgeted
  cascade is explicitly deferred to a separate, later reviewed phase (per approved decision), pending
  closing the known gap where `budgetPoolDeletionBlockers()` doesn't check a memo's own legacy
  `budgetPoolId` (`docs/BvA_REQUIREMENT.md` "Phase 7A-1" §9).

#### Removed
- `_updateBpoolYearFromStart()` (`views/budget.js`) — dead code once `bpool-start` (free-text month
  input) no longer exists; its behavior (live year derivation from Start Month) is now structurally
  guaranteed by construction (Year and Month selects can never disagree) rather than needing a live
  re-derivation listener.

#### Explicitly not done (per approved decisions)
- Export (`exportBudgetPoolsCSV`) still shows raw Gregorian — not converted to BE this phase.
- Archive/Active/Inactive — not implemented; confirmed deferred to 7A-9C.
- Delete-to-Unbudgeted cascade behavior — not implemented; hard-block behavior unchanged, only its
  messaging improved.
- Bulk import (`handlePoolBulkUpload`/`_confirmPoolImport`) untouched — its own hardcoded `'2569'`
  fallback and inline duplicate check remain open items (TD-7A-01/TD-7A-04).
- No Supabase, persistence model, or Forecast changes.

#### Tests
- `tests/financial-models.test.js`: `formatMonthBE()` unit tests (BE conversion, BE-year-boundary
  correctness, empty/invalid input, full-date input); `openBudgetTagModal()` structural test extended
  to confirm it renders the pool period via `formatMonthBE()`.
- `tests/budget-expenses.test.js`: replaced the Phase 7A-9A `_updateBpoolYearFromStart`/free-text
  `bpool-start`/`bpool-end` tests (now-impossible scenarios) with equivalent-purpose tests for the
  new Year+Month-select mechanism — including the exact "2569 -> 2026-01 to 2026-12" auto-populate
  requirement, the Start-Month-bumps-End-Month guard, and the legacy `year:"3112"` self-heal in the
  new picker. Added: `populateBudgetYearSelect`'s `extraYear` behavior; Budget Settings/BvA BE period
  display (and that raw Gregorian no longer leaks into either table); `as-year` BE label (structural,
  no execution harness for `renderActualSpend()`'s full dependency set); `deleteBudgetPool()`
  messaging (named pool + per-source breakdown when blocked; named pool when not); `saveBudgetPool()`
  overlap warning naming the specific conflicting pool. Full suite (205 tests) re-run and passes.

---

### Phase 7A-9A - Year/BE Normalization Foundation & Project Dropdown Foundation
#### Added
- `getCurrentBuddhistYear()` (`app.js`) — the single "what year is it right now, in BE" helper,
  wrapping the existing `gregorianYearToBuddhistEra()`. Replaces the ad hoc
  `String(new Date().getFullYear() + 543)` duplicated in `_ovUpdateKPIs()`, `_ovRenderBvA()`,
  `_renderBudgetVsActual()` (`views/budget.js`), and the Tag Budget modal (`views/history.js`) —
  closing `docs/BvA_REQUIREMENT.md` "Phase 7A-1" §2 Known Issue #2. Also replaces the hardcoded
  `'2569'` fallback used whenever `bva-year`/`bset-year` is momentarily absent from the DOM.
- `getCanonicalProjectList()` (`app.js`) — a single Settings-backed Project list helper. Foundation
  only: `bpool-project` (Budget Pool Settings) is migrated onto it in this phase; every other
  Project dropdown keeps its existing data source (see Deferred below).
- `populateBudgetYearSelect(id)` (`views/budget.js`) — generates BE year options (current year ± 1)
  for `bva-year` and `bset-year`, replacing two independently hardcoded `2568/2569/2570` `<option>`
  lists in `index.html` that would have silently run out of a "current year" choice after BE 2570.
  Populated once per page load (no-ops once the `<select>` already has options), same convention as
  the existing `bva-project` one-time populate.
- `_updateBpoolYearFromStart()` (`views/budget.js`) — recomputes the read-only `bpool-year` field
  live from `bpool-start` via `gregorianYearToBuddhistEra()`, wired through `bpool-start`'s
  `oninput`. Addresses the UI half of `docs/TECHNICAL_DEBT.md` TD-7A-01's "Budget Pool create/edit
  derives year" exit criterion — the data layer already derived `year` from dates since Phase 7A-3,
  but the modal could still visually show a stale/independently-seeded value while open.

#### Changed
- `openBudgetPoolModal()` now sources its Project `<select>` from `getCanonicalProjectList()`
  instead of an inline `loadSettings()?.projects || []` read, and seeds `bpool-year` from the
  pool's own `startMonth` (when present) rather than always trusting the pool's possibly-stale
  stored `year` label or the ambient `bset-year` filter.
- `parseThaiDate()` (`views/budget.js`) now converts BE→CE for both the Thai month-name format and
  the `dd/mm/yy(yy)` format through the shared `financialYearToGregorian()` helper instead of two
  separate local `-543` computations. Verified equivalent for all realistic inputs (Thai month-name
  years and post-short-year-expansion `dd/mm/yy` years are always well above the function's `>2400`
  BE-detection threshold); only a never-occurring 4-digit literal year in the narrow 2101–2400 band
  would convert differently, which no real date in this app produces.
- `index.html`'s `bva-year` and `bset-year` `<select>` elements are now empty and populated at
  render time by `populateBudgetYearSelect()` — no more hardcoded BE year lists in markup.
- `refreshProjectDropdowns()` (`views/settings.js`) no longer references `bgt-project` — a dead id
  left over from a since-renamed/removed tab; it was already a silent no-op (`getElementById`
  returned `null`), so this is pure dead-code removal, not a behavior change.

#### Unchanged (explicitly out of scope for this phase)
- Persistence model, Supabase integration, Forecast, Import/bulk-import logic (including the Budget
  Pool bulk import's own `'2569'` fallback and inline duplicate/year checks — TD-7A-01/TD-7A-04),
  Budget Assignment Workspace behavior, Budget Pool CRUD redesign, and Archive/Delete workflows were
  not touched.
- No other Project dropdown (Pending's data-derived filter, Actual Spend's data-derived filter, BvA
  Budget Pool's data-derived filter, Resource's mixed source, etc.) was migrated onto
  `getCanonicalProjectList()` — see Deferred below.

#### Deferred (documented, not fixed in this phase)
- **Project dropdown data-source fragmentation**: roughly a dozen Project dropdowns across the app
  are split between Settings-canonical (`loadSettings().projects`) and data-derived (observed
  project values from memos/Actual Spend/pools/resources) sources, with no single refresh path.
  `getCanonicalProjectList()` is the foundation for eventually unifying the Settings-backed half;
  the data-derived dropdowns are an intentionally separate, larger decision (do they *want*
  Settings-only values, or do they need to keep surfacing legacy/renamed projects still present in
  historical data?) left for a future phase. Tracked as new TD-7A-07 in `docs/TECHNICAL_DEBT.md`.
- Budget Pool bulk import's hardcoded `'2569'` fallback (`handlePoolBulkUpload()`) was left
  untouched — it sits inside the Import code path, explicitly out of scope this phase.
- TD-7A-01's remaining exit criteria (bulk import derives year; existing pools audited/migrated;
  regression tests proving no mismatched legacy pools remain) are still open.

#### Tests
- `tests/financial-models.test.js`: `getCurrentBuddhistYear()` matches the formula it replaces;
  `getCanonicalProjectList()` returns `[]` without `loadSettings` and `settings.projects` with it;
  `financialYearToGregorian()`/`gregorianYearToBuddhistEra()` remain exact inverses.
- `tests/budget-expenses.test.js`: `populateBudgetYearSelect()` renders current year ± 1 with the
  current year selected and is a no-op once populated; `index.html` no longer hardcodes
  `2568/2569/2570` for `bva-year`/`bset-year`; `renderBudgetSettings()` populates `bset-year`
  dynamically; `openBudgetPoolModal()` uses `getCanonicalProjectList()` and seeds `bpool-year` from
  a pool's own `startMonth` (including the TD-7A-01 legacy-mismatch case) or the ambient `bset-year`
  filter for a brand-new pool; `_updateBpoolYearFromStart()`'s three-tier fallback
  (`startMonth` → `bset-year` → `getCurrentBuddhistYear()`); `parseThaiDate()` still parses Thai
  month-name, `dd/mm/yy`, and `dd/mm/yyyy` BE dates correctly after the refactor.
- Full existing suite (183 tests total after these additions) re-run and passes unchanged.

#### Follow-up fix ("3112" bug) — small blocker fix, same phase
- **Bug**: typing a Buddhist Era-shaped value directly into the Start/End Month field (e.g.
  `2569-01`, meaning January BE 2569 / Gregorian 2026-01) was never normalized to Gregorian before
  being used. `gregorianYearToBuddhistEra()` then treated `2569` as if it were already the
  Gregorian year and added 543 again, producing a nonsensical `3112` in the `bpool-year` field and,
  worse, in the persisted pool's `year` (since `createBudgetPoolRecord()` re-derives `year` from
  the same un-normalized `startMonth` on save).
- **Fix**: added `normalizeMonthValueToGregorian()` (`app.js`) — converts a `"YYYY-MM"`/
  `"YYYY-MM-DD"` value's year from BE to Gregorian using the same `>2400` threshold as
  `financialYearToGregorian()`, leaving an already-Gregorian value unchanged. Wired in at three
  points in `views/budget.js`: `_updateBpoolYearFromStart()` (normalizes before deriving the
  live-displayed `bpool-year`), `openBudgetPoolModal()` (normalizes a pool's stored `startMonth`
  before seeding the modal, self-healing any legacy record saved with this bug), and
  `saveBudgetPool()` (normalizes `bpool-start`/`bpool-end` before building the entry passed to
  `createBudgetPoolRecord()`, which is where the bug actually reached persisted storage).
- **Scope**: this is a normalization fix only — `bpool-start`/`bpool-end` remain plain `type="month"`
  text inputs. Replacing them with a proper month picker/select is explicitly deferred to
  Phase 7A-9B, not done here.
- **Tests**: `normalizeMonthValueToGregorian('2569-01')` / `('2026-01')` both resolve to `2026-01`
  and both derive BE year `2569` (not `3112`) — `tests/financial-models.test.js`.
  `_updateBpoolYearFromStart()` with a typed `'2569-01'` Start Month resolves `bpool-year` to
  `2569`; `openBudgetPoolModal()` normalizes a legacy pool stored with BE-typed `startMonth`
  (`'2569-01'`/`year:'3112'`) so the modal shows `bpool-start="2026-01"` and `bpool-year="2569"`;
  `saveBudgetPool()` end-to-end with typed BE `'2569-01'`/`'2569-12'` persists
  `startMonth:'2026-01'`, `endMonth:'2026-12'`, `year:'2569'` — `tests/budget-expenses.test.js`.
  Manually verified in-browser: typing `2569-01` into Start Month live-updates the year field to
  `2569`, and saving persists Gregorian `2026-01`/`2026-12`.

#### Follow-up (data contract fix) — one canonical Budget Pool read/write contract, same phase
- **Bug**: Budget Settings' year filter/list/grouping (`renderBudgetSettings()`) filtered by a raw
  stored `pool.year` read via `loadBudgetPools()` (never canonicalized), while the Edit modal
  already derived `year` from normalized `startMonth`. A pool whose raw `year` disagreed with its
  own `startMonth` (e.g. `year: '2569'`, `startMonth: '2025-01'`) would appear under the wrong
  Budget Settings year filter and show a different year when opened for editing — the exact
  filter-vs-modal mismatch reported in the field.
- **Deeper conflict found and fixed**: `createBudgetPoolRecord()` — the canonicalizer every other
  read path (`renderBudgetSettings`, BvA, exports, mapping) relies on — did not itself call
  `normalizeMonthValueToGregorian()` before deriving `year`. A legacy record saved with a BE-typed
  `startMonth` (e.g. `'2569-01'`, from before the "3112" fix above) would still reproduce `year:
  '3112'` when read through the *canonical* path; only the Edit modal's bespoke normalization was
  protected. Folded `normalizeMonthValueToGregorian()` into `createBudgetPoolRecord()` itself (now
  normalizes `startDate`/`startMonth`/`endDate`/`endMonth` before deriving `year`), so every
  canonical read is Gregorian-safe, not just the modal.
- **Fix (read path)**: `renderBudgetSettings()`, `openBudgetPoolModal()` (date/year fields only —
  project/name/budget/memoTypes still read from the raw pool, unchanged), and
  `exportBudgetPoolsCSV()`'s no-`_bvaDataset`-yet fallback now all read through
  `createBudgetPoolRecord()` instead of a raw `loadBudgetPools()` result.
- **Fix (write path)**: `savePoolAsync()` — the single Budget Pool persistence function used by both
  manual save and bulk import — now canonicalizes its input via `createBudgetPoolRecord()` before
  writing to localStorage/Supabase, so `year` can never be persisted independently of
  `startMonth`/`endMonth` regardless of what the caller computed.
- **Explicitly not done** (out of scope per this sub-phase): no Normalize/repair button, no startup
  auto-migration, no rewrite of existing Supabase/localStorage records outside of an explicit save,
  no bulk-import Year-column-vs-Start-Month warning UI, no duplicate/overlap validation changes.
  TD-7A-01's "existing pools audited or migrated" and "bulk import derives year" exit criteria
  remain open by design — canonical *reads* now self-heal mismatched records at runtime, but
  storage itself is only corrected when a pool is explicitly re-saved.
- **Tests**: `createBudgetPoolRecord()` normalizes a typed-BE `startMonth`/`endMonth` and derives
  `year` from the normalized value, including the `year: '3112'` legacy-corruption case
  (`tests/financial-models.test.js`); `renderBudgetSettings()` excludes a raw-`year`-mismatched pool
  from the wrong filter year and includes it under its normalized year
  (`tests/budget-expenses.test.js`); `savePoolAsync()` normalizes and re-derives `year` for both a
  BE-typed and an already-Gregorian raw entry, independent of `saveBudgetPool()`'s own
  normalization; `exportBudgetPoolsCSV()`'s fallback path exports the canonical, not stale, year;
  `openBudgetPoolModal()`'s legacy-BE-typed-pool test extended to also assert `bpool-end` displays
  the normalized value. Full suite (194 tests) re-run and passes unchanged.

#### Follow-up (Step 7 — Assignment Contract Audit), same phase
- **Bug found**: `openBudgetTagModal()` (`views/history.js`) — the "Assign Budget Pool" selector
  used from All Memo's Tag Budget action and from the Budget Assignment Workspace's "Assign" button
  for Approved Memo records — built its year filter dropdown and pool option list from raw
  `loadBudgetPools()`. A legacy corrupted pool (e.g. `year: "3112"`, pre-dating the "3112" fix) would
  be directly selectable as a literal `"3112"` year filter option, and pool rows displayed raw
  (possibly BE-typed) `startMonth`/`endMonth`, disagreeing with Budget Settings/BvA/Export.
- **Fix**: `allPools` is now built via `loadBudgetPools().map(createBudgetPoolRecord)` before the
  year filter (`yearSet`) and pool options (`buildPoolOptions()`) are derived from it — the same
  canonicalization pattern used everywhere else this phase. `saveBudgetTag()`'s own cross-year/
  cross-project guard was already canonical (Phase 7A-3) and is unchanged.
- **Scope check**: the Manual Actual Spend modal's Budget Pool `<select>` (`views/budget.js`,
  `openManualExpenseModal()`) was reviewed and left as-is — its option labels only show
  `project`/`name`, never `year`/`startMonth`/`endMonth`, so it cannot display a corrupted year; its
  save-time validation already canonicalizes (`saveManualExpenseFromModal()`, prior phase). No
  Assignment Workspace or Manual Override redesign performed.
- **Tests**: structural test on `openBudgetTagModal()`'s source (same convention as the existing
  `saveBudgetTag()` structural tests, since no execution harness exists for `views/history.js`)
  confirms `allPools` is canonicalized via `createBudgetPoolRecord()` before the year filter and
  pool-option filtering read from it (`tests/financial-models.test.js`). Manually verified in-browser:
  seeded a pool with raw `year: "3112"` — the Tag Budget modal's year filter shows only `2569`/`2568`
  (never `3112`), and the pool's displayed period reads the normalized `2026-01 → 2026-12`. Full
  suite (195 tests) re-run and passes unchanged.

---

### Phase 7A-8 - Budget vs Actual UX Consistency & Polish (pending review — not committed)
#### Added
- BvA filter row (`index.html`, `#bgt-tab-bva`) gains a Spend Type filter (`#bva-type`) and a free-
  text search input (`#bva-search`), matching the Actual Spend tab's `as-type` options/order/labels
  and the Manual Entries search convention exactly, instead of inventing new filter semantics.
  `_renderBvaWith()` converts the selected short code via the existing `spendTypeFromMemoType()` and
  passes `spendType`/`search` into `calculateBudgetVsActualDataset()` as two new, purely additive
  filter keys (`app.js`) — omitting them (all existing callers) reproduces the exact prior output,
  confirmed by the full existing test suite passing unchanged plus a new explicit backward-
  compatibility test.
- `.hist-table--ellipsis` modifier (`style.css`) factors out the one-line-per-row/ellipsis rule that
  three different BvA tables previously each redeclared inline with three different padding values
  (9px 14px / 9px 12px / 7px 10px). The Budget Pool table, the shared drill-down table
  (`actualSpendRowsTable()`), and the Assignment Workspace table (`budgetAssignmentRowsTable()`) all
  now use the same `.hist-table`/`.hist-table--ellipsis`/`.hist-amt` classes already used elsewhere
  in the app, so padding, header style, numeric right-alignment, and row hover are identical across
  all three instead of three near-duplicate implementations.
- A lightweight "Loading…" placeholder appears in `#bva-content` only on first mount (empty
  container), before `loadBudgetPoolsAsync()` resolves — reuses the existing empty-state "card"
  look rather than introducing a new spinner pattern. Filter-driven re-renders are unaffected (no
  flicker) since the container is no longer empty after the first render.

#### Fixed
- `_renderBvaWith()`'s empty-state check omitted `needsReviewRecords`, so a filter combination that
  left zero pool rows and zero Unbudgeted records but a non-empty Needs PMO Review bucket incorrectly
  fell back to the "no Budget Pool for this year" Settings CTA, hiding a real, already-computed
  Needs PMO Review item. Fixed by including `needsReviewRecords.length` in the same check (mirrors
  the Phase 7A-4 fix that added the bucket to `totals.actual`).
- The "no Budget Pool" empty state no longer conflates two different situations: truly no Budget
  Pool exists for the selected year (still shows the original Settings CTA), versus pools exist for
  the year but the active Project/Spend Type/Search filter combination matches nothing (now shows a
  distinct "ไม่พบข้อมูลตามเงื่อนไขที่เลือก" message suggesting the user clear a filter, instead of
  incorrectly telling them to go create a Budget Pool that already exists).
- `exportBudgetPoolsCSV()` previously exported every stored Budget Pool regardless of the BvA tab's
  active Year/Project filters, while the adjacent "Export BvA" button (same toolbar) already
  exported only the filtered dataset — the two buttons could disagree for the same filter state. It
  now exports `_bvaDataset.rows.map(row => row.pool)` (the exact pools currently visible on screen),
  falling back to the unfiltered list only if the tab hasn't rendered yet.

#### Changed
- `calculateBudgetVsActualDataset()`'s `scopedRecords` computation (`app.js`) now delegates its
  project/spendType predicates to the existing shared `queryActualSpend()` helper instead of
  re-implementing a project-only filter inline, so a Spend Type filter added to the Budget vs Actual
  UI cannot silently diverge from the identical filter already used by Actual Spend
  (`filteredActualSpendRecords()`). Output is byte-for-byte identical to before for any call that
  does not set `filters.spendType`/`filters.search`.

#### Unchanged
- No change to `mapBudgetPool()`, `findMatchingBudgetPools()`, `calculateBudgetUtilization()`,
  `calculateForecast()`, the Assignment Workspace's assignment routing
  (`assignBudgetPoolFromWorkspace()`), Manual Override precedence, Unbudgeted/Needs PMO Review
  classification, or the Supabase schema. Budget Pool CRUD/Settings, Bulk Upload, and Infra Cost
  Budget Pool assignment are untouched and out of scope (deferred to Phase 7A-9 per the brief).

#### Tests
- Added to `tests/financial-models.test.js`: `calculateBudgetVsActualDataset()`'s new Spend Type
  filter narrows `rows[].records`/`totals.actual`/export totals while leaving `rows[].budget`/
  `totals.budget` unchanged; the new search filter matches reference/description case-insensitively
  and an empty search is a no-op; omitting both filters reproduces prior behavior exactly.
- Added to `tests/budget-expenses.test.js`: the new `#bva-type`/`#bva-search` controls exist in
  `index.html` with the same options as `as-type` and reuse the shared `.ri` input style; the Spend
  Type filter narrows the Budget Pool table and hides non-matching Unbudgeted/Needs Review sections;
  the search filter narrows visible records and clearing it restores the combined total; the new
  filter-specific empty state renders (and the Settings CTA does not) when pools exist but none
  match the active filters; the original Settings CTA still renders when truly no pool exists for
  the year; a regression test reproducing a cross-year Needs-Review-only scenario proving the fixed
  empty-state check no longer hides it; `exportBudgetPoolsCSV()` exports only the currently filtered
  pools; the Budget Pool table, drill-down table, and Assignment Workspace table all render the same
  shared table classes with no leftover ad-hoc per-table padding. All 171 existing + new tests across
  `tests/budget-expenses.test.js`, `tests/financial-models.test.js`, and `tests/workflow.test.js`
  pass unchanged.

#### Remaining Work / Deferred
- Not committed — pending review per instruction.
- Budget Pool CRUD, Budget Pool Settings, and Bulk Upload consistency/validation unification
  (`docs/BvA_REQUIREMENT.md` §7/§8, already documented as a known issue) remain explicitly deferred
  to Phase 7A-9, per this phase's guardrails.
- Overview's embedded KPI/BvA widgets (`_ovUpdateKPIs()`, `_ovRenderBvA()`) still read the separate
  legacy `loadSLBudgets()` store instead of the canonical Budget Pool/Actual Spend pipeline that the
  dedicated Budget vs Actual tab now uses consistently — a pre-existing, already-documented issue
  (`docs/BvA_REQUIREMENT.md` §11, tracked as `TD-7A-03`). Not fixed here: it is a data-source/
  business-logic change explicitly out of this UX-only phase's guardrails, and multiple prior phase
  docs already reserve it for a dedicated Overview parity phase.
- The Budget vs Actual tab has no chart/donut of its own (only KPI cards, a linear progress bar, and
  tables) — Part 4 ("Chart Polish") therefore had no in-scope chart to polish. Overview's bar/donut
  charts are a separate tab, were substantively reworked in Phase 7A-6, and were left untouched here
  to avoid re-opening a recently-stabilized, out-of-file-scope area for a BvA-focused UX pass.
- `exportBudgetPoolsCSV()`'s column header "ประเภท Memo" still refers to the legacy Memo Type
  concept rather than the canonical "Spend Type" term used everywhere else (including the sibling
  "Spend Types" column in `exportBudgetVsActualCSV()`'s headers). Left unchanged in this pass because
  a single-column rename would mix Thai/English terminology awkwardly within one export; recommend a
  full export-header terminology pass across all Budget & Spend exports together in a later phase.
- The Budget Pool row's whole-row click-to-drill-down (Budget Pool table) and the Unbudgeted/Needs
  PMO Review banner's explicit "View items →" button use two different interaction granularities
  (drill into a modal vs. navigate to a full workspace view). This is treated as an intentional,
  reasonable distinction given the different navigation depth of each action, not an inconsistency
  to fix — documented here for visibility rather than silently left unmentioned.

### Phase 7A-7 Follow-up - BvA Assignment Workspace UI Consistency Fix (pending review — not committed)
#### Fixed
- **Part 1 (stacked modals):** clicking a memo reference from the Budget Pool drill-down modal
  (`showBvaActualSpend()`) previously opened the All Memo detail (`openMemoReadOnly()`) on top of
  the still-open `bva-memo-panel` backdrop, stacking two modals. New `showBvaRecordDetail(recordId)`
  closes `bva-memo-panel` first, then opens the detail — a no-op when called from the in-page
  Budget Assignment Workspace, which has no such modal to begin with.
- **Part 2 (cramped pool drill-down):** `showBvaActualSpend()`'s modal widened from 760px to 900px
  (`max-width` 95vw → 96vw) and its row/header padding increased (7px 10px → 9px 12px) for
  readability on desktop. Still the same lightweight, read-only 5-column table (Reference, Source,
  Project, Spend Type, Amount) — no edit/assign action was added.
- **Part 3 (wrong detail context):** both BvA-context reference links (`actualSpendRowsTable()`,
  used by the pool drill-down and "all" modal; `budgetAssignmentRowsTable()`, used by the workspace)
  now call `showBvaRecordDetail()` → `showActualSpendRecord()` — the same Actual Spend Detail
  layout already used from the Actual Spend tab — instead of `openMemoReadOnly()`'s All Memo
  approval/history detail. `views/history.js`/`openMemoReadOnly()` itself is unchanged; it remains
  in use elsewhere (e.g. `showActualMemos()`), which is out of scope for this BvA-only fix.

#### Investigated, no change needed
- **Part 4 (manual modal consistency):** Manual Entries' "Edit" button and
  `assignBudgetPoolFromWorkspace()`'s manual-origin path already both call the identical
  `openManualExpenseModal(expenseId)` — confirmed via a new test asserting byte-identical rendered
  HTML from both entry points. No second modal existed; only a regression test was added to guard
  against future divergence.

#### Unchanged
- No change to `app.js`, `index.html`, mapping/validation logic (`mapBudgetPool()`,
  `saveManualExpenseFromModal()`, `saveBudgetTag()`), Forecast, Import/Export, or the Supabase
  schema. Infra Cost remains view-only, unimplemented by design.

#### Tests
- Added to `tests/budget-expenses.test.js`: opening a reference from the pool drill-down modal
  leaves exactly one modal open (the Actual Spend detail, with the drill-down modal closed first);
  the pool drill-down modal is wider and still shows exactly the five original fields with no
  assign action; `showBvaRecordDetail()` opens the Actual Spend-style detail (not
  `openMemoReadOnly()`); Manual Entries Edit and BvA workspace Assign render byte-identical Manual
  Actual Spend modal HTML. Updated two existing tests whose assertions targeted the now-replaced
  `openMemoReadOnly()` reference link to instead assert `showBvaRecordDetail()`. Upgraded
  `createBvaContext()`'s DOM mock to track dynamically created/removed panels by id (needed to
  actually exercise the "close the previous modal" fix in tests, rather than a silent no-op).

#### Remaining Work / Deferred
- Not committed — pending review per instruction.
- Infra Cost Budget Pool assignment remains out of scope (view-only, unimplemented by design).
- No redesign of the full Budget vs Actual tab was attempted — only the modal/detail consistency
  issues named in this follow-up.

### Phase 7A-7 - Budget Assignment Workspace Navigation (pending review — not committed)
#### Added
- A dedicated Budget Assignment Workspace (`renderBudgetAssignmentWorkspace()`,
  `budgetAssignmentRowsTable()`, `views/budget.js`) — a sub-view of the Budget vs Actual tab
  (toggled by a new `_bvaCurrentView` flag: `'summary'` | `'assignment'`), not a new top-level tab,
  since `MASTER_SPEC.md` fixes Budget & Spend at exactly five tabs. Lists every Unbudgeted and Needs
  PMO Review Actual Spend record (Reference/Memo No, Project, Source, Spend Type, Description,
  Amount, Coverage, Budget Status, Reason, and an assignment action) as one-row-per-record tables,
  in-page — never a modal/popup, per this phase's requirement.
- `assignBudgetPoolFromWorkspace(recordId)` — dispatches each row's "Assign" action to the existing,
  already-validated canonical path for that record's source: `openBudgetTagModal()` (→
  `saveBudgetTag()` → `updateActualSpendBudgetOverride()`) for Approved Memo records, and
  `openManualExpenseModal()` (→ `saveManualExpenseFromModal()`) for Manual Actual Spend, with a
  workspace refresh added on top of the existing save flow. No new mapping/validation algorithm was
  written — every project/year/spend-type rule is enforced by the same `mapBudgetPool()`/
  `saveManualExpenseFromModal()` guards already in place since Phase 7A-3. Infra Cost has no
  Budget-Pool field in its persistence model; the workspace shows it as view-only with an explicit
  note (and `assignBudgetPoolFromWorkspace()` alerts rather than silently doing nothing) instead of
  inventing a new storage model for it.
- `showBudgetAssignmentWorkspace()` / `closeBudgetAssignmentWorkspace()` toggle `_bvaCurrentView`
  and re-render; `renderBudgetVsActual()` now returns its render promise so callers (and tests) can
  await the refresh instead of racing it.

#### Changed
- BvA's Unbudgeted / Needs PMO Review summary sections keep their exact same visibility (count +
  total) but their action changed: "View items" now calls `showBudgetAssignmentWorkspace()` instead
  of the Phase 7A-5-follow-up behavior of inlining the full record table directly in the BvA
  summary. Budget Pool rows and the "all" KPI drill-down (`showBvaActualSpend()`) are unchanged —
  still the existing lightweight modal, per this phase's Part 1 allowance.

#### Unchanged
- No change to `app.js`, `mapBudgetPool()`, `updateActualSpendBudgetOverride()`,
  `calculateBudgetVsActualDataset()`, Forecast, Import/Export, or the Supabase schema. The five
  Budget & Spend tabs and their current behavior are unchanged; this is an additional in-page
  sub-view of the existing "Budget vs Actual" tab only.

#### Tests
- Added to `tests/budget-expenses.test.js`: BvA "View items" navigates to the workspace rather than
  a modal (with a round-trip back to the summary); the workspace lists Unbudgeted and Needs PMO
  Review records with all required fields, memo-reference click-through preserved, and no
  horizontal-scrolling table; `assignBudgetPoolFromWorkspace()` routes to the correct existing
  function per source and surfaces a clear Infra Cost note; a Manual Actual Spend assignment updates
  manual persistence and reconciles to Manual Override; a memo-origin Needs PMO Review assignment
  resolves via the existing override path; cross-project and cross-year assignments are blocked and
  never persist; BvA totals stay equal while only the bucket allocation changes after an assignment;
  Forecast and export totals are unaffected by an assignment.

#### Remaining Work / Deferred
- Not committed — implementation is pending review per this phase's explicit instruction.
- `saveBudgetTag()`'s own DOM-bound radio-button flow (views/history.js) was exercised indirectly
  (via `updateActualSpendBudgetOverride()`, the function it calls) rather than end-to-end through
  the Tag Budget modal's DOM, since `views/history.js` is not loaded in this test harness.
- Infra Cost Budget Pool assignment remains unimplemented by design (Part 4) — no safe existing
  persistence path exists for it without introducing a new storage model.

### Phase 7A-6 - Overview Chart Layout Fix
#### Fixed
- Overview's "Spend breakdown" chart card (`index.html`) laid out the main chart and the donut +
  legend with `grid-template-columns:1fr 200px`. A bare `1fr` track cannot shrink below its
  content's min-content width, so when Group by = Project rendered many series/legend entries the
  row could demand more width than the card/viewport, pushing the donut/legend toward or past the
  right edge instead of staying inside the card. Changed to
  `grid-template-columns:minmax(0,1fr) minmax(180px,220px)` (new `.ov-breakdown-grid` class) plus
  `min-width:0` on both grid items, which lets the main chart column shrink instead of forcing
  page-level horizontal overflow.

#### Added
- A `@media (max-width: 720px)` rule collapses `.ov-breakdown-grid` to a single column, so on
  narrow widths the donut/legend stacks below the main chart instead of squeezing beside it.
- `#ov-donut-legend` now has `max-height:200px;overflow-y:auto;overflow-x:hidden`, so Group by
  Project with many projects grows an internal scrollbar instead of growing the card/page height
  (or width) without bound. Every project still appears in the legend — none are hidden — they
  simply scroll into view.

#### Unchanged
- No change to `app.js`, `views/budget.js` JS logic, KPI calculation, filters (3M/6M/12M/Custom),
  Group by Type/Project behavior, chart data/totals, or donut percentages — this is a CSS/HTML
  layout-only fix. `_ovRenderChart()`/`_ovRenderDonut()` were not modified; individual legend rows
  already truncated long labels via `text-overflow:ellipsis` before this phase.
- Forecast, Budget vs Actual, Actual Spend, Manual Entry, Supabase, and mapping logic untouched.

#### Tests
- Added to `tests/budget-expenses.test.js`: the responsive `.ov-breakdown-grid` class and its
  `minmax(0,1fr)`/media-query/legend-scroll rules exist in `index.html` and the old fixed
  `1fr 200px` grid is gone; Group by Project with many (18) projects keeps every project in the
  legend and in the chart's dataset count, with rows still truncating instead of widening; Group by
  Type still renders a populated bar chart and legend after the layout change; Overview KPI/chart/
  donut/comparison totals remain equal across presets and after switching Group by Project (i.e.
  the layout change did not alter any calculated value).

#### Remaining Work (intentionally deferred, not part of this scope)
- Section B (Budget vs Actual comparison rows) and other Overview sub-sections were not reviewed
  for the same responsive-grid issue — only the Section A "Spend breakdown" chart card named in
  this ticket was in scope.
- No JS changes were needed or made; if a future phase wants virtualized/paginated legends for
  very large project counts, that remains a separate, larger change.

### Phase 7A-5 Follow-up - Match Budget & Spend UX Brief v2
#### Fixed
- Overview custom range (`ov-from-sel`/`ov-to-sel`, `views/budget.js`, `index.html`) validated and
  applied on every dropdown `onchange`, so picking a new start month before choosing an end month
  could pop the ">12 months" alert immediately, mid-selection. The `onchange` handlers were removed
  from both selects — only the existing "Apply" button now calls `ovApplyCustomRange()` — so the
  user can freely change both dropdowns and validation/apply only happens once, on Apply.
- Switching to "Custom" (`ovSetPreset(0)`) never set `ov-from-sel`/`ov-to-sel`'s value, so the
  browser defaulted the `from` selector to its first `<option>` — the oldest of the 24 months built
  by `_ovBuildMonths()`, i.e. up to two years back — even though a different period (e.g. the last
  12 months) was actually applied and displayed next to it. `ovSetPreset(0)` now seeds both
  selectors with `_ov.fromIdx`/`_ov.toIdx` (the currently applied range) when entering Custom mode.
- `showBvaActualSpend()`'s drill-down (Budget Pool rows, and the "all" KPI Actual click-through)
  rendered one stacked, multi-line card per record (Phase 7A-5's fix for horizontal scroll). The
  brief clarified the request was one row per record on a single line, not multiple lines per
  record. Replaced with a shared `actualSpendRowsTable()` table (`table-layout:fixed` + per-cell
  `text-overflow:ellipsis`), so every record is exactly one line and the table never needs
  horizontal scroll regardless of content length (full values remain available via the `title`
  attribute).
- Unbudgeted and Needs PMO Review no longer open as a pop-up drill-down at all. `_renderBvaWith()`
  now renders both as always-visible in-page sections (`#bva-unbudgeted-section` /
  `#bva-needs-review-section`) directly on the Budget vs Actual tab, each using the same one-row-
  per-record table, so the full list is visible as part of the page rather than behind a click —
  and so a future "map to Budget Pool" action (not implemented in this phase) has a natural home.

#### Changed
- `showActualSpendDetailModal()`'s lower field section (Spend Type through Notes) no longer wraps
  every group of fields in a filled grey (`var(--bg-2)`) box. Fields are now split into three named,
  visually separated groups — "Spend Details", "Audit", and "Notes" (its own full-width block) —
  divided by a thin top border instead of a background panel. The header (Reference/Description/
  Source/Budget Status/Project badges), the function's call signature, and every field both Actual
  Spend Detail and Manual Entry Detail already passed are unchanged — no field was removed and no
  data value changed, only how the lower section is grouped and separated.

#### Unchanged
- No change to `app.js`, to any Actual Spend/Budget Pool/mapping/Forecast calculation function, or
  to the Supabase schema. The 3M/6M/12M Overview preset buttons' behavior is untouched — only the
  Custom branch of `ovSetPreset()` changed.

#### Tests
- Replaced the prior Phase 7A-5 BvA drill-down/layout tests in `tests/budget-expenses.test.js` with
  versions matching the one-row-per-record table and the new in-page Unbudgeted/Needs PMO Review
  sections (the old tests asserted a card layout and a `showBvaActualSpend('unbudgeted'/'needs-
  review')` pop-up, both superseded by this follow-up). Added: custom-range selects carry no
  `onchange`; changing the selects alone (no Apply) does not validate, alert, or touch the
  graph/KPI/chart-render count; a valid range only applies on Apply; switching to Custom seeds the
  selectors with the currently applied range; the in-page Unbudgeted/Needs PMO Review sections
  render inline with one row per record and no horizontal scroll; the "all" drill-down includes
  Mapped, Unbudgeted, and Needs PMO Review with the KPI, drill-down, and export totals all equal and
  no record duplicated; a Budget Pool row drill-down shows only its own records, one per line; the
  Approved-Memo reference-link behavior is preserved in the new table layout. Kept unmodified: the
  Phase 7A-5 Actual Spend Detail field-completeness/badge test and the Source-badge helper tests
  (unaffected by this round's layout-only changes).

#### Remaining Work (intentionally deferred, not part of this brief)
- "Prepare for future budget mapping from the Unbudgeted list" is limited to a code comment marking
  where a future per-row "Map to Budget Pool" action would go; no mapping UI or logic was added.
- Manual Entries' own list table, BvA filter/button row alignment, and Budget Settings pool table
  readability remain unchanged, as in the prior Phase 7A-5 round.

### Phase 7A-5 - Budget & Spend Functional UX Fix
#### Fixed
- Overview's custom date range (`ovApplyCustomRange()`, `views/budget.js`) no longer silently caps
  a selection wider than 12 months down to 12 months while leaving the wider range showing in the
  selectors. A range over 12 months is now blocked outright with a clear `alert()` message, the
  `to` selector is reverted to the last valid value, and no KPI/period update happens for the
  rejected selection.
- The Actual Spend page's grouped "Source" badge (`renderActualSpend()`) was hardcoded to a blue
  pill for every source (Memo, Historical, Infra alike). It now uses the shared
  `actualSpendSourceBadgeClass()`/`actualSpendSourceShortLabel()` helpers so each source renders
  with its own colour, matching the already-correct colour coding in the page's summary line above
  the table.
- `showBvaActualSpend()` (Budget vs Actual drill-down / Budget Pool row drill-down / Unbudgeted
  drill-down) rendered a 5-column table that required horizontal scrolling at the modal's width,
  which could make a record (e.g. Amount) look missing rather than merely off-screen. It now
  renders one responsive, auto-wrapping card per record, so every field is visible without
  horizontal scrolling regardless of screen width.
- `showBvaActualSpend('all')` did not include `needsReviewRecords` (Phase 7A-4's Needs PMO Review
  bucket), so the "click Actual Spend KPI to drill down" total could be lower than the KPI card's
  own `totals.actual`. It now includes Needs PMO Review records in the "all" scope, and
  `_renderBvaWith()` adds a dedicated "Needs PMO Review" section (mirroring the existing
  "Unbudgeted" section) with its own drill-down, so the bucket introduced in Phase 7A-4 is now
  reachable and visible on the BvA tab, not just correctly totaled behind the scenes.

#### Added
- Budget Pool / Unbudgeted / Needs PMO Review / "all" drill-down rows now show a clickable
  Reference No for Approved-Memo-sourced records, reusing the existing shared read-only Memo viewer
  `openMemoReadOnly()` (`views/history.js`, already used the same way from License and Device tabs)
  — no new memo module was built. Manual/Historical and Infra Cost rows (no backing Memo) render
  the reference as plain text.
- `actualSpendSourceShortLabel()` / `actualSpendSourceBadgeClass()` / `actualSpendBudgetStatusBadgeClass()`
  (`views/budget.js`) — shared presentation-only helpers reused everywhere an Actual Spend record's
  source or budget status is displayed as a badge. They only map an existing stored value to a CSS
  class/short label; they do not change any stored value.

#### Changed
- `showActualSpendDetailModal()` (shared by Actual Spend Detail and Manual Entry Detail) now
  follows the same header layout as All Memo's "Memo Detail" modal (`views/history.js
  _buildMemoDetailContent()`): a prominent Reference No, a subject line, and Source/Budget Status
  badges, followed by the remaining fields grouped into readable 3-column sections — with no
  approval log, since neither Actual Spend nor Manual Entry records have an approval workflow. The
  function's call signature (`title, fields, helper, details`) and every field both callers already
  passed are unchanged, so no Actual Spend or Manual Entry field was dropped or reordered in the
  underlying data — only how it is grouped and styled changed.

#### Unchanged
- No change to `app.js`, to any Actual Spend/Budget Pool/Forecast calculation or mapping function,
  or to the Supabase schema. `calculateBudgetVsActualDataset()`, `mapBudgetPool()`, and
  `calculateForecast()` are untouched.

#### Tests
- Added to `tests/budget-expenses.test.js`: a custom Overview range over 12 months is blocked with
  a message and does not change the KPI/period (and a valid 12-month range immediately afterward
  still works); a BvA scenario with one Mapped, one Unbudgeted, and one Needs PMO Review record
  proving the KPI Actual total, the "all" drill-down total, and the dedicated Needs PMO Review
  drill-down all agree and no record is duplicated; the drill-down panel has no wide `<table>` and
  uses the auto-fit card layout; an Approved Memo row's reference is wired to `openMemoReadOnly()`
  while Manual/Infra rows are not; a Budget Pool row drill-down shows only that pool's own records
  without a wide table; `actualSpendSourceBadgeClass()`/`actualSpendSourceShortLabel()` return a
  distinct value per source; the Actual Spend page's Source column source uses the shared badge
  helper instead of a hardcoded colour; the redesigned Actual Spend Detail layout still renders
  every canonical field (Reference, Description, Source, Project, Spend Type, Amount, Vendor/
  Program, Budget Pool, Budget Status, Created By, Notes, etc.) with no data loss.

#### Remaining Work (intentionally deferred, not part of this scope)
- Manual Entries' own list table (Excel import / download template button placement, action-column
  alignment, description truncation with a "view details" affordance) was not restyled — only its
  detail modal was. Out of the six scope items given for this phase.
- Budget vs Actual tab's filter/button row alignment, and the Budget Settings pool table's
  readability (project/pool colour coding), were not changed — raised in the reference PPT but not
  in this phase's six numbered scope items.
- Overview's embedded budget-vs-actual widget (`_ovRenderBvA()`, legacy `loadSLBudgets()` source)
  was not touched — pre-existing, separately tracked as `TD-7A-03`.
- Cross-page date/column-name/button consistency beyond the six scope items (raised broadly in the
  reference PPT) was not attempted, per "do not redesign the whole UI."

### Phase 7A-4 - Fix BvA Needs PMO Review Total Drop
#### Fixed
- `calculateBudgetVsActualDataset()` (`app.js`) no longer silently drops the amount of Actual Spend
  records whose `budgetStatus` is `Needs PMO Review` from `totals.actual`. Previously, such records
  always have `finalBudgetPoolId = null` (see `mapBudgetPool()`) but were only ever tested against
  the `unbudgetedRecords` filter (`budgetStatus === 'Unbudgeted'`), so they matched neither a pool
  row nor the Unbudgeted bucket and vanished from the grand total entirely the moment an Actual
  Spend record matched more than one overlapping Budget Pool — a state the app explicitly supports
  and warns about at Budget Pool save time.

#### Changed
- `calculateBudgetVsActualDataset()` now returns an additional `needsReviewRecords` array and
  `totals.needsReviewActual`, computed the same way as the existing `unbudgetedRecords` /
  `totals.unbudgetedActual` pair but filtered on `budgetStatus === 'Needs PMO Review'` instead.
  `totals.actual` is now `mappedActual + unbudgetedActual + needsReviewActual`.
- `budgetVsActualExportDataset()` now emits an additional "Needs PMO Review" summary row (mirroring
  the existing "Unbudgeted" summary row) whenever `needsReviewRecords` is non-empty, so the CSV
  export's row-level Actual Spend column still sums to the dataset's grand total.

#### Unchanged
- No cross-year / cross-project mapping rule, Manual Entry behavior, Forecast, Overview, Import, Tag
  Budget, or Supabase migration was modified. `mapBudgetPool()`, `findMatchingBudgetPools()`, and
  `calculateForecast()` are untouched — Forecast continues to ignore `budgetStatus` entirely.
- The existing `outOfScopePoolRecords` case (an Actual Spend record whose `finalBudgetPoolId` points
  to a pool outside the currently filtered `pools`/`selectedPools` scope) is intentionally not
  addressed here; it is a separate, distinct gap from the Needs PMO Review bucket and out of scope
  for this focused fix.

#### Tests
- Added to `tests/financial-models.test.js` (Phase 7A-4 section): a Needs PMO Review record is
  counted in `totals.actual`; it is excluded from `unbudgetedRecords`/`totals.unbudgetedActual`; it
  has its own `needsReviewRecords`/`totals.needsReviewActual` bucket; Mapped, Unbudgeted, and Needs
  PMO Review records are each counted exactly once with no double counting across buckets; BvA
  export includes a Needs PMO Review summary row and export totals still equal dataset totals; a
  Phase 7A-3 cross-year/cross-project blocked override still lands in Unbudgeted (not reclassified
  as Needs PMO Review); Forecast remains unaffected by the new bucket.

#### Remaining Work
- UI follow-up (not part of this data-layer fix): the Budget vs Actual page rendering and its
  drill-down UI in `views/budget.js` do not yet have a dedicated visual section for
  `needsReviewRecords` the way they do for `unbudgetedRecords`; a future UI-focused phase should
  surface the new bucket distinctly on screen. Data totals are correct now regardless of that UI gap.
- The `outOfScopePoolRecords` scenario noted above remains a known, separate gap for a future phase.

### Phase 7A-3 - Same-Year Budget Pool Mapping Contract
#### Follow-up fixes (cross-project Manual Override guard)
- Manual Override must now match both project and year, not year alone. Previously
  `mapBudgetPool()` only checked year, so Manual Entry could select a Budget Pool from a different
  project — the save "succeeded" but the record never appeared under that pool in Budget vs Actual
  (which groups by project/pool scope), making the amount look silently missing rather than
  Unbudgeted.
- `mapBudgetPool()` now also rejects a `manualBudgetPoolId` whose pool's `project` differs from the
  Actual Spend record's own `project`: it clears `manualBudgetPoolId`/`autoBudgetPoolId`/
  `finalBudgetPoolId`, sets `budgetStatus: "Unbudgeted"`, and flags
  `mappingWarning: "blocked-cross-project-override"` (mirroring the existing cross-year block,
  which still applies independently and still sets `"blocked-cross-year-override"` when the
  project matches but the year does not). `updateActualSpendBudgetOverride()` inherits this for
  free since it already delegates to `mapBudgetPool()`.
- `saveManualExpenseFromModal()` (`views/budget.js`) now blocks the save at save time with a clear
  error and does not persist the invalid `budgetPoolId` if the selected pool's project differs from
  the manual expense's project — checked alongside, and before, the existing same-year check.
- `saveBudgetTag()` (`views/history.js`) now applies the same project guard for memo Tag Budget,
  comparing the pool's canonical `project` against the memo's `project` before writing anything,
  ahead of the existing cross-year guard.

##### Tests
- Added to `tests/financial-models.test.js`: same-year-but-cross-project Manual Override blocked
  and flagged (`mapBudgetPool`); blocked cross-project override still visible as Unbudgeted in BvA
  totals (not silently missing); same-project/same-year control still works;
  `updateActualSpendBudgetOverride` blocking a cross-project Tag Budget selection; a structural
  check that `saveBudgetTag()`'s project guard exists and runs before both the cross-year guard and
  `updateActualSpendBudgetOverride`.
- Added to `tests/budget-expenses.test.js`: a behavioral test proving
  `saveManualExpenseFromModal()` blocks a cross-project pool selection with a clear error and does
  not persist the invalid `budgetPoolId`, with a same-project/same-year control proving the save
  still succeeds.

#### Follow-up fixes (pre-commit clarification pass)
- `saveBudgetTag()`'s cross-year guard no longer fails open when no canonical Actual Spend record
  exists yet for the memo (e.g. stale/unrefreshed canonical storage) — it now falls back to
  deriving the memo's own coverage date via `memoCoveragePeriod()`, mirroring
  `actualSpendFromMemo()`'s exact fallback chain, so the check is never silently skipped.
- `createActualSpendRecord()` now preserves `mappingWarning` across normalization. Previously the
  flag only existed in `mapBudgetPool()`'s immediate return value and was silently dropped every
  time a record passed through `storeActualSpendRecords()`/`loadActualSpendRecords()` — meaning a
  blocked cross-year override could become indistinguishable from an ordinary never-assigned
  Unbudgeted record after a single store/reload cycle.

#### Follow-up fixes (strict review, pre-commit)
- Tag Budget (`saveBudgetTag()` in `views/history.js`) now blocks a cross-year Budget Pool
  assignment at save time with a clear error, instead of silently persisting a memo whose
  underlying Actual Spend record was reclassified to `Unbudgeted` without any user feedback.
  Compares against the pool's canonical derived year, not its raw stored year.
- `budgetPoolDeletionBlockers()` now also checks persisted manual expense and memo-level
  `budgetPoolId` references, not just the canonical Actual Spend mapping — a Budget Pool no longer
  becomes deletable merely because a cross-year override was cleared from the canonical record;
  any raw source still referencing it keeps deletion blocked.
- `saveManualExpenseFromModal()`'s save-time validation now compares against the Budget Pool's
  canonical derived year (`createBudgetPoolRecord()`), not the raw stored `year` from the
  unnormalized `loadBudgetPools()` cache, so a pool whose raw label disagrees with its own dates
  is validated correctly rather than against a stale label.

#### Changed
- Budget Pool `year` is now always derived from the pool's own `startDate`/`startMonth`
  (`createBudgetPoolRecord()`), using a new shared `gregorianYearToBuddhistEra()` helper — a
  conflicting `year` input is ignored whenever coverage dates exist, and is only used as a
  fallback when no date data is present at all.
- Budget Pools can no longer span multiple Gregorian years — `validateBudgetPoolRecord()` now
  rejects a pool whose `startDate` and `endDate` fall in different years with
  `"Budget Pool must not span multiple years"`.
- Manual Actual Spend no longer auto-maps under any circumstance. With no Budget Pool selected it
  is always `Unbudgeted`, even if a matching pool would otherwise be found by project/spend
  type/date range (`mapBudgetPool()`).
- Cross-year Manual Override is blocked at both layers: the data layer (`mapBudgetPool()` refuses
  to honor a `manualBudgetPoolId` whose pool's year disagrees with the spend's own coverage year,
  clearing `manualBudgetPoolId`/`autoBudgetPoolId`/`finalBudgetPoolId` and setting
  `mappingWarning: "blocked-cross-year-override"` so it is detected, not silently normalized) and
  the save layer (`saveManualExpenseFromModal()` in `views/budget.js` now rejects the save with a
  clear error and does not persist the invalid `budgetPoolId` if the selected pool's year does not
  match the manual spend's coverage year).
- Approved Memo-created Actual Spend and Infra Cost continue to auto-map exactly as before, with
  one addition: `findMatchingBudgetPools()` now also requires the candidate pool's year to match
  the record's coverage year, closing the Phase 7A-1/7A-2 silent-drop gap at its source rather
  than compensating for it in `calculateBudgetVsActualDataset()`.

#### Unchanged
- `calculateBudgetVsActualDataset()` and `budgetVsActualExportDataset()` were not modified — no
  `outOfScopePoolRecords`-style bucket was introduced. Once mapping only ever produces a same-year
  `finalBudgetPoolId` (or `null`), the existing `unbudgetedRecords`/`totals.unbudgetedActual`
  already account for every blocked or never-assigned record without any structural change.
- Forecast, Overview, Import, and the Tag Budget modal were not modified.

#### Known Issues (not fixed in this phase)
- Existing invalid legacy records — a Budget Pool already spanning multiple years, or an Actual
  Spend record with an already-stored cross-year override — are detected and flagged
  (`mappingWarning`) the next time reconciliation runs, but are not retroactively repaired. The
  underlying stored `budgetPoolId`/`year` values are left exactly as they were; only the derived
  `budgetStatus` changes. A manual data-quality review of existing pools and overrides is
  recommended before relying on this phase's totals for historical years.
- Budget Pool bulk import still does not call the shared validator, so a bulk-imported pool could
  still be saved spanning multiple years (pre-existing gap, documented in
  `docs/BvA_REQUIREMENT.md` "Phase 7A-1" §7/§8, not addressed here).

#### Tests
- Replaced the two Phase 7A-2 fail-first tests, which constructed their mismatched pool by passing
  a conflicting `year` alongside `startMonth`/`endMonth` directly to `createBudgetPoolRecord()` —
  that construction is no longer possible now that `year` is always derived from dates, so the bug
  is fixed structurally rather than reproduced. Replaced with a legacy-simulation test (a
  mismatched pool is hand-constructed to simulate pre-fix stored data) proving the record remains
  visible as `Unbudgeted` rather than vanishing.
- Added tests in `tests/financial-models.test.js` for: year derivation and the conflicting-input
  fallback; multi-year-span rejection; Manual Actual Spend never auto-mapping; same-year Manual
  Override; cross-year Manual Override being blocked and flagged (asserting
  `getFinalBudgetPoolId()` returns `null`); Approved Memo and Infra Cost same-year auto-mapping
  (positive and negative); BvA totals including flagged Unbudgeted records; and Forecast being
  unaffected by the new mapping/blocking logic.
- One pre-existing test's fixture (`Phase 7 Budget Pool CRUD validation rejects invalid and
  duplicate pools...`) was adjusted to remove a `startDate`/`endDate` pair that would otherwise
  now allow `year` to be derived, which had made its `"Year is required"` assertion obsolete under
  the new derivation rule; the assertion itself is unchanged.

### Phase 7A-2 - BvA Year Silent-Drop Bug: Fail-First Regression Tests
#### Added
- Three behavioral tests in `tests/financial-models.test.js` proving the Budget Pool year
  silent-drop bug documented in `docs/BvA_REQUIREMENT.md` "Phase 7A-1" §2: a Budget Pool whose
  `year` label disagrees with its own `startMonth`/`endMonth` can cause a validly-mapped Actual
  Spend record to disappear from `calculateBudgetVsActualDataset()`'s totals entirely — neither
  matched under its pool nor counted as Unbudgeted — regardless of whether Budget vs Actual is
  filtered by the pool's year label or by the record's own date-derived year.
- A control test proving the same mapping/BvA path works correctly when a pool's `year` agrees
  with its date range, isolating the bug to the year-mismatch condition specifically.

#### Tests
- `Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered
  by the pool's own year label, even though the pool's date range disagrees` — fails on current
  code.
- `Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered
  by the record's date-derived year, even though the pool's year label disagrees` — fails on
  current code.
- `Phase 7A-2 control: BvA includes actual spend normally when pool.year agrees with its
  startMonth/endMonth` — passes on current code.

#### Unchanged
- No application logic, UI, or Supabase migrations were modified. No existing test was changed or
  weakened. `calculateBudgetVsActualDataset()`, `mapActualSpendRecords()`, and related mapping
  functions remain exactly as before.

#### Remaining Work
- Phase 7A-3 must reconcile Budget Pool `year` with its own date range (or otherwise close this
  gap) so the two new fail-first tests above pass without weakening the control test.

### Phase 7A-1 - Budget Pool Data Contract Documentation
#### Added
- Locked Budget Pool business contract in `BvA_REQUIREMENT.md` covering identity
  (`project` + `name` + `year`), year handling, multi-month mapping, manual override precedence,
  the canonical automatic mapping rule, missing-pool behavior, duplicate-pool rules, bulk import,
  deletion/orphan risk, Forecast independence, the Overview legacy-budget-source issue, the
  Supabase schema-audit requirement, and dead-code-cleanup ordering.
- `Phase 7A` entry in `PHASE_PLAN.md` distinguishing this roadmap track (per
  `docs/AI_ENIGINEERING_GUIDE/05_PHASE_HISTORY.md`) from the earlier, differently-scoped `Phase 7`
  already recorded in this changelog and plan.

#### Known Issues Documented (not fixed in this sub-phase)
- Budget Pool `year` is an independently stored field, not derived from `startDate`/`startMonth`,
  and can be saved contradicting the pool's own date range.
- Buddhist Era year conversion is duplicated across multiple call sites instead of one shared
  helper.
- Budget Pool bulk import re-implements its own duplicate/conflict validation instead of reusing
  the shared manual add/edit validator, and its duplicate check is case-sensitive where the manual
  path is case-insensitive.
- The Budget Pool deletion guard checks only canonical Actual Spend references, not legacy
  memo-level Budget Pool references.
- Overview's KPI and embedded Budget-vs-Actual widgets read a separate legacy budget store instead
  of the canonical Budget Pool table, so Overview figures may not reconcile with the canonical
  Budget vs Actual tab.

#### Unchanged
- No application logic, UI, tests, or Supabase migrations were modified. All mapping, override,
  deletion, Forecast, and Overview behavior described above reflects the pre-existing
  implementation, verified by reading the code, not altered by this documentation phase.

#### Remaining Work
- Phase 7A-2 onward implements against the locked contract (year derivation, shared BE helper,
  bulk import unification, manual override warnings, memo-level orphan review), per
  `PHASE_PLAN.md`.

---

### Phase 4 completion verification (2026-07-01)

#### Completed
- Preserved Manual Notes independently in canonical Actual Spend records and Report Detail.
- Preserved locally saved Vendor / Program during reloads from Supabase environments whose schema cache does not yet expose `vendor_program`.
- Displayed the already-mapped final Budget Pool name in read-only Actual Spend Report Detail without changing mapping or Budget vs Actual behavior.

#### Tests
- Added behavioral create/edit/reload persistence, schema-lag compatibility, canonical Notes, and Report Detail Budget Pool coverage.

#### Unchanged
- Budget Pool mapping and validation, Budget vs Actual, Forecast, import contract, Report calculations, and canonical financial calculations.

### Actual Spend import frequency inference fix (2026-07-01)

#### Fixed
- Manual Entries imports now infer frequency from normalized calendar-month coverage, so both `YYYY-MM` and full-date ranges spanning multiple inclusive months persist as Monthly.
- Same-day and single-month records remain One-time.
- Monthly imported Amount continues to be divided by inclusive coverage months before manual persistence, preserving canonical Report and Forecast totals.

#### Unchanged
- Import template, columns, parser contract, Report, Forecast, Budget vs Actual, Budget Pool mapping, and canonical financial calculations.

#### Tests
- Added month-only, full-date, Excel serial, Date-object, one-day, Manual frequency, canonical total, and Forecast parity coverage.

### Phase 4 — Manual Actual Spend modal and amount alignment (2026-07-01)

#### Changed
- Renamed the manual add/edit workflow to Manual Actual Spend and aligned its Reference No, Spend Type, Description, Frequency, and save labels.
- Removed Entry Type, Quantity, and Unit Cost from the modal while retaining their compatible persistence values internally.
- Added frequency-aware Amount / Monthly Amount entry and an inclusive-month live Estimated Total preview.
- Added an independent Vendor / Program field to manual persistence and canonical Actual Spend projection.

#### Compatibility
- Existing stored `amount` remains authoritative; one-time records store the total and monthly records store the monthly amount.
- New saves continue writing `quantity = 1` and `unitCost = amount` for the existing Supabase schema.
- Import columns, template, parser, and coverage-total semantics remain unchanged.
- Manual saves retry without `vendor_program` only when Supabase reports the specific PGRST204 missing-column schema-cache error, while retaining Vendor / Program locally until the migration is visible.

#### Migration
- Added an additive `vendor_program` column to `budget_manual_expenses`.

#### Tests
- Added modal contract, single-path preview calculation, legacy amount, Vendor / Program persistence, schema-cache fallback, import compatibility, parity, and additive migration coverage.

### Manual Entries import routing fix (2026-07-01)

#### Fixed
- Actual Spend files imported from the Manual Entries workflow now normalize every row to editable Manual / Historical persistence, regardless of the Excel Source value.
- Imported Infra rows retain Spend Type `Infra`, appear in Manual Entries and canonical Report, and support the existing edit and soft-delete flow.
- Source normalization occurs before duplicate validation so repeat Manual Entries imports remain detectable.
- Existing direct-canonical and legacy Infra Cost records remain supported.

#### Tests
- Added mixed-Source routing, imported-Infra edit/delete and total updates, and legacy direct-canonical Infra regression coverage.

### Actual Spend Excel date parsing fix (2026-07-01)

#### Fixed
- Actual Spend import now normalizes Excel serial date values and SheetJS `Date` objects before strict calendar validation.
- Excel cells representing first-of-month ranges retain month precision, while full dates retain day precision.
- Existing `YYYY-MM` and `YYYY-MM-DD` strings and matching-precision validation remain unchanged.

#### Tests
- Added coverage for Excel serial full dates, Excel serial month ranges, Date objects, invalid date text, and mixed-precision rejection.

### Manual Entries Delete confirmation fix (2026-07-01)

#### Fixed
- Removed the unintended second reason prompt that could cancel Delete after the user had already confirmed.
- Delete now uses `Deleted from Manual Entries` as its audit reason, soft-deletes the persisted manual-expense ID, and rerenders/reconciles canonical Actual Spend immediately.
- Added UI-button wiring coverage for both manually added and Excel-imported manual records, plus success, cancellation, persistence-failure, and canonical-total regression coverage.

### Phase 3.2 — Manual Entries QA fixes (2026-07-01)

#### Changed
- Removed the manual internal-ID fallback from canonical Reference No; blank references remain blank in data and display as `—` in Manual Entries and Report details.
- Made Manual Entries Delete an explicit soft-delete flow with clear confirmation, a default audit reason, cancellation feedback, transactional remote/local behavior, and clear failure feedback.
- Reduced the Manual Entries table to nine summary columns and kept schedule, Budget Pool, creator, notes, and creation method in View Detail.
- Reconfirmed Actual Spend Report drill-down/detail remains read-only with no Edit, Delete, or Void actions.

#### Unchanged
- Manual Add/Edit fields and wording, Entry Type, Quantity/Unit Cost, import template/parser, amount semantics, date/month pickers, exports, calculations, Report grouping/totals, Budget Pools, Forecast, BvA, Spend Types, and legacy records.

#### Tests
- Added wrapper-level soft-delete success/failure coverage, canonical total exclusion, internal-ID leakage regression coverage, and compact table/detail contract checks.

### Phase 3.1 — Manual QA UI fixes (2026-07-01)

#### Changed
- Formatted Manual Entries Created At and Updated At values as user-friendly local date/time text instead of raw ISO timestamps.
- Applied the same audit timestamp formatting to read-only Actual Spend Report details.
- Shortened the Manual Entries search placeholder without changing search behavior.
- Verified Report detail remains informational only, with no Edit, Delete, or Void actions.

#### Unchanged
- Financial calculations, persistence, CRUD behavior, imports/templates, exports, filters, Report grouping, Budget Pools, Forecast, Budget vs Actual, and date/month pickers.

#### Tests
- Added focused UI coverage for timestamp formatting and the shorter search placeholder; retained read-only Report detail coverage.

### Phase 3 — Manual Entries management and read-only Report (2026-07-01)

#### Changed
- Added a flat Manual Entries management table sourced only from active manual-expense persistence, including manually added and Excel-imported manual records.
- Added search and project, spend type, frequency, coverage date, and budget status filters plus View Detail, Edit, and soft Delete actions.
- Kept soft-deleted manual records hidden and excluded from canonical Actual Spend and downstream totals.
- Removed maintenance actions and edit routing from Actual Spend Report drill-down/detail; manual report details now direct users to Manual Entries.
- Made Reference No optional and display blank references as `—` without exposing internal record IDs.
- Kept the import template columns, parser, amount/date semantics, form layout, Report grouping/totals, Forecast, Budget vs Actual, Budget Pool CRUD, Spend Types, and legacy support unchanged.

#### Tests
- Added targeted coverage for Manual Entries source isolation, active-only behavior, actions/filters, soft deletion, optional references, and read-only Report details.

### Phase 2 — Separate Actual Spend report and manual maintenance (2026-07-01)

#### Changed
- Added Report and Manual Entries sub-tabs under Actual Spend.
- Kept the grouped report, filters, totals, drill-down, and existing report CSV export together in Report.
- Moved Add Actual Spend, Import Excel, and Download Template into Manual Entries without changing their handlers or permissions.
- Kept the existing 9-column import template, parser, amount semantics, and Phase 1 editable/soft-deletable persistence unchanged.

#### Tests
- Added targeted coverage for the default Report tab, sub-tab visibility, and maintenance-action placement.

### Phase 1 import template verification (2026-07-01)

#### Verified
- The downloaded Actual Spend workbook uses the parser's canonical columns exactly: Source, Reference No, Spend Type, Project, Amount, Start Date, End Date, Vendor / Program, and Description.
- Both workbook examples parse and validate successfully.
- `YYYY-MM` and `YYYY-MM-DD` are supported and documented; Start Date and End Date must use the same format.
- `Others` remains valid because it is part of the shared Spend Type master. Unknown values are rejected.
- New Manual / Historical imports continue through editable manual-expense persistence and support soft deletion.

#### Tests
- Added regression coverage for the exact template header contract, both date formats, template sample validation, and the valid `Others` Spend Type.
- No production behavior or UI was changed.

### Revised Phase 1 — Unify Actual Spend Excel import persistence (2026-07-01)

#### Scope
Route **new** Actual Spend Excel imports whose `Source` is "Manual / Historical" into the
existing manual expense persistence path (`orbit-pmo-manual-expenses-v1`), so imported rows
become editable and soft-deletable exactly like manually added rows. Imports with `Source`
"Approved Memo" or "Infra Cost" are unchanged — they continue to write directly to canonical
Actual Spend as read-only reporting records, preserving legacy behavior.

#### Files changed
- `views/budget.js`
- `tests/budget-expenses.test.js`

#### What changed
- Added `manualExpenseFromImportedActualSpend(record)`: converts a validated, canonical-shaped
  imported Actual Spend row into the same object shape the manual expense form saves. A row
  whose coverage spans exactly one month (or has no/partial dates) becomes a `one_time` manual
  expense with the full imported amount; a row spanning more than one month becomes a `monthly`
  manual expense whose stored per-month amount is `total ÷ coverageMonths`, so re-multiplying by
  `coverageMonths` (the existing manual→canonical projection logic) reproduces the original
  imported total instead of double-counting it.
- Added `promoteImportedManualExpenses(records)`: after `importActualSpendRecords()` writes
  validated rows to canonical storage (unchanged), this moves any `Manual / Historical Expense`
  sourced rows into the manual expense store via the existing `saveManualExpenseAsync()`, then
  removes their direct-canonical copy so the existing `reconcileActualSpendSources()` re-projects
  them the same way manually added expenses are projected (with an `actual-spend-manual-` id).
- `handleActualSpendImport()` now calls `promoteImportedManualExpenses(result.records)` after a
  successful import, before re-rendering. No change to file parsing, column mapping, validation,
  or the "all-or-nothing" / duplicate-skip behavior.
- `showActualSpendGroup()` (the Actual Spend report's drill-down panel) now shows a **Void**
  button next to any record that resolves to an editable manual expense (source is
  `Manual / Historical Expense` and its id exists in the manual expense store), calling the
  existing `voidManualExpense()`. This was needed because, before this phase, void was only
  wired to an unreachable panel (`showManualExpenses`/dead code) — there was no reachable UI path
  to soft-delete *any* manual expense record, imported or manually added. Legacy direct-canonical
  rows (Approved Memo, Infra Cost, and any pre-existing import not present in the manual expense
  store) do not get this button and remain read-only, unchanged.

#### Data flow
Before: Excel import (any source) → `importActualSpendRecords()` → written directly to canonical
Actual Spend → permanently retained as-is by `reconcileActualSpendSources()`'s "keep everything
that isn't a projected manual/infra id" rule → **not editable, not soft-deletable**.

After (Manual / Historical rows only): Excel import → `importActualSpendRecords()` (still
validates and writes to canonical first, unchanged) → `promoteImportedManualExpenses()` converts
each Manual/Historical row into a manual expense record, saves it via the same
`saveManualExpenseAsync()` the "Add Expense" form uses, and removes the direct-canonical copy →
`reconcileActualSpendSources()` re-projects it via `manualExpenseToActualSpend()`, identical to a
manually added row → editable via the existing report drill-down, soft-deletable via Void.
Approved Memo and Infra Cost imports are untouched and keep flowing straight to canonical.

#### Explicitly NOT changed
- The manual "Add Expense" form: no field, layout, date picker, month picker, frequency-based
  field visibility, Entry Type, or button text changes.
- No Adjustment entry type introduced; Entry Type field left as-is for a later cleanup phase.
- Forecast calculation logic (`calculateForecast`) — untouched.
- Budget vs Actual calculation logic (`calculateBudgetVsActualDataset`) — untouched.
- Budget Pool CRUD — untouched.
- The grouped Actual Spend report layout/table — untouched (only the drill-down panel gained one
  conditional action cell).
- No Report / Manual Entries sub-tabs created.
- Legacy direct-canonical imported records (Approved Memo, Infra Cost, and any import that
  predates this phase) remain read-only reporting records.
- `importActualSpendRecords()` in `app.js` — untouched; still validates and writes every valid
  row to canonical storage exactly as before (this preserves its existing direct unit-test
  contract in `tests/financial-models.test.js`).

#### Tests
Added to `tests/budget-expenses.test.js`:
- Excel import of Manual/Historical rows creates editable manual expense records with correct
  one-time and monthly totals (proves no double-counting: `3000` total over 3 months stores as
  `1000`/month and reconstructs to `3000`).
- An imported manual expense record can be edited and the change flows into canonical Actual
  Spend.
- Soft-deleting an imported manual expense excludes it from canonical Actual Spend, Forecast, and
  Budget vs Actual totals.
- Excel import of Approved Memo and Infra Cost rows stays direct-canonical and read-only,
  unaffected by manual expense routing.
- Actual Spend group drill-down offers Void for editable imported manual expense records.

#### Test run
- Ran `node --test tests/budget-expenses.test.js tests/financial-models.test.js tests/workflow.test.js`.
- Result: 65 passed, 0 failed.
- JavaScript syntax checks passed for `app.js` and `views/budget.js`.

#### Remaining work
- Entry Type field cleanup (possible removal of "Adjustment"/"Other" options) deferred to a later
  UI cleanup phase, per scope.
- Report / Manual Entries sub-tab split deferred, per scope.

---

### Phase C - Actual Spend Export Alignment
#### Changed
- Actual Spend CSV export now includes canonical record identity, currency, amount basis, coverage status, vendor/program, final Budget Pool, and optional Notes alongside the existing audit fields.
- Existing Reference, date, and Budget Pool columns were clarified as Reference No, Start/End Date, and Final Budget Pool.
- Export Amount remains the canonical total for the coverage period and continues to use the same filtered records as the UI.

#### Tests
- Added export coverage for canonical field alignment, UI/export total parity, and Approved Memo, Manual / Historical, and Infra Cost rows.

### Phase B - Actual Spend Field Clarity
#### Changed
- The Manual Historical form now labels Monthly entries as a monthly amount and explains that the resulting total equals monthly amount multiplied by inclusive coverage months.
- One-time entries are explicitly labeled as a one-time total without changing their calculation.
- The Actual Spend import template now states that Amount is the total amount for the coverage period, not a monthly amount.

#### Tests
- Added focused label/helper coverage while retaining the existing one-time, monthly, Infra, and import validation behavior tests.

### Phase A - Actual Spend Import Validation
#### Changed
- Actual Spend imports now reject unknown Source and Spend Type values with row-level field errors instead of coercing them to Manual/Historical or Others.
- Approved Memo, Manual / Historical, and Infra Cost remain accepted; the supported Infrastructure label maps to the shared Infra Spend Type.
- The import template now lists the accepted Source values and uses the Manual / Historical label.

#### Tests
- Added behavioral coverage for invalid enum rejection, all-or-nothing row validation, all three valid sources, and the supported Infrastructure alias.

### Infra Cost Entry Consolidation
#### Changed
- Actual Spend is now the only UI path for entering or importing Infra Cost spending.
- Settings now contains Budget Pool configuration only.

#### Removed
- Settings Infra Cost navigation, manual add/edit/delete modal, and dedicated bulk-upload flow.

#### Tests
- Added regression coverage proving the Settings entry paths are absent while Infra Cost remains valid in canonical Actual Spend, Budget vs Actual, Forecast, export, drill-down data, and Unbudgeted totals.

### Phase 7 - Budget Pool Integration and Release Verification
#### Added
- Shared Budget Pool create/edit validation for required fields, positive budgets, valid periods, duplicate identity, and overlapping project/Spend Type conflicts.
- Safe deletion guard for Budget Pools referenced by canonical Actual Spend.
- Focused regression coverage for Budget Pool validation, conflict handling, re-mapping, BvA recalculation, export parity, and the five-tab release scope.

#### Changed
- Budget Pool create/edit/delete now re-runs shared Actual Spend mapping so Budget vs Actual, utilization, remaining budget, drill-down, export, and Unbudgeted data stay aligned.
- Overlapping pools may be confirmed and saved; affected records follow the shared `Needs PMO Review` mapping rule.

#### Removed
- Obsolete Others tab, panel, and legacy memo-based rendering path, as required by `BvA_REQUIREMENT.md`.

#### Data Flow
- Budget Pool CRUD → shared validation → canonical Budget Pool storage → shared Actual Spend mapping → canonical Budget vs Actual dataset and export.

#### Remaining Work
- Full role-based authorization and Supabase baseline/RLS verification remain deferred per the confirmed project decisions.

### Phase 6 - Budget vs Actual
#### Added
- Shared Budget vs Actual dataset and CSV serializer for KPI, chart, pool table, drill-down, export, and Unbudgeted totals.
- Canonical Actual Spend drill-down for all spend, individual Budget Pools, and Unbudgeted items.
- Focused behavioral tests for utilization parity, remaining-budget calculation, drill-down/export total parity, and Unbudgeted selection.

#### Changed
- Budget vs Actual now consumes canonical Actual Spend and the shared Budget Utilization calculation instead of recalculating from memos and manual expenses.
- Remaining Budget is consistently derived as Budget minus Actual Spend; the page and export reuse the same totals.

#### Data Flow
- Canonical Actual Spend + Budget Pools → shared Budget vs Actual dataset → KPI, comparison chart, pool table, drill-down, Unbudgeted section, and CSV export.

#### Remaining Work
- Later cleanup phases remain unchanged.

### Phase 5 - Forecast
#### Added
- Shared rolling forecast calculation and Forecast CSV export.
- Focused coverage for Software/Infra filtering, inclusive monthly allocation, and the fixed rolling window.

#### Changed
- Forecast now consumes canonical Actual Spend only and displays six actual months plus six forecast months.
- UI and export reuse the same filtered forecast dataset and shared calculation engine.
- Actual months remain coverage-bound; forecast months now carry the latest calculable monthly cost forward after coverage ends.
- Forecast CSV serialization now comes from the same shared Forecast dataset rendered by the table.

#### Remaining Work
- Records with missing coverage remain excluded from monthly Forecast allocation.

---

### Phase 0
#### Added
- Master Specification
- Requirement document
- Coding Guide

#### Remaining Work
- Phase 1 implementation

---

## Review - 2026-06-30

#### Reviewed
- Compared the current implementation with `MASTER_SPEC.md`, `BvA_REQUIREMENT.md`, and the existing phase plan.
- Confirmed partial implementations for memo lifecycle, historical/manual expense, infra cost, budget pools, Budget & Spend views, imports, exports, and drill-downs.
- Ran 14 existing tests successfully and verified JavaScript syntax for `app.js` and `views/budget.js`.

#### Gaps Identified
- No canonical persisted Actual Spend source; financial pages assemble different source sets and calculations.
- No shared Spend Type model across memo, Actual Spend, Budget Pool, forecast, and exports.
- Budget mapping lacks persisted auto/manual/final pool fields, ambiguity status, and Unbudgeted re-evaluation.
- Overview still uses a separate SL budget store; totals and allocation logic differ across pages and exports.
- Forecast does not implement the required rolling 6 actual + 6 forecast coverage-period rule.
- Infra remains a separate calculation/storage path instead of an Actual Spend record with Spend Type Infra.
- The legacy Others tab remains present.
- Existing tests do not cover mapping priority, ambiguity, re-evaluation, forecast rules, or cross-page/export parity.

#### Documentation Changed
- Reworked `PHASE_PLAN.md` into dependency-ordered phases with expected files, exit criteria, requirement traceability, risks, and blockers.

#### Remaining Work
- Resolve the specification/schema decisions listed as blockers in `PHASE_PLAN.md` before implementation.
- Implement Phases 0-7; no feature code was changed during this review.

---

### Phase 1A
#### Added
- Shared Spend Type master and memo-type mapping.
- Local, Supabase-compatible Actual Spend and Budget Pool model normalizers.
- Inclusive coverage-month calculation with `Missing Coverage` handling.
- Shared financial storage, duplicate detection, validation, and all-or-nothing import helpers.
- Focused model and storage tests.

#### Changed
- Current calculations default to THB while retaining a currency field for future use.
- Added generated Actual Spend IDs and strict calendar validation.
- Added Budget Pool validation and canonical-to-legacy Spend Type synchronization.
- Restricted shared persistence to validated financial records.
- Added shared Actual Spend/Budget Pool query helpers under a common helper namespace.

#### Remaining Work
- Connect the shared models to application workflows and financial pages in later phases.
- Defer Supabase migration until the baseline schema is available.

---

### Phase 1B
#### Added
- Shared Budget Pool auto-mapping by project, Spend Type, and pool period.
- Manual override precedence and shared Budget Status values.
- Multiple-match handling with `Needs PMO Review` and no-match handling with `Unbudgeted`.
- Shared Actual Spend total and Budget utilization calculations.
- Batch mapping helper for re-evaluating Actual Spend records.

#### Remaining Work
- Connect shared mapping and calculations to workflows and UI in later phases.

---

### Phase 2
#### Added
- Idempotent Actual Spend posting when a memo reaches Completed status.
- Memo lifecycle removal guard so Pending, Rejected, and Cancelled memos do not contribute to Actual Spend.
- Canonical Budget Pool and Budget Status display in the existing All Memo Budget column.
- Existing PMO Budget Pool modal now persists manual overrides to Actual Spend.

#### Changed
- Completed memo posting uses the Phase 1 Spend Type master and Budget Pool mapping priority.

#### Remaining Work
- Downstream financial pages continue to use their existing data paths until their planned phases.

---

### Phase 3 - Unified Actual Spend
#### Added
- Actual Spend summary cards, canonical record table, Budget Status filter, and row drill-down.
- Historical/Manual and Infra Cost projection into the shared Phase 1A Actual Spend model.
- Actual Spend spreadsheet import using Phase 1A validation, all-or-nothing failure, and duplicate rules.
- Focused tests covering the three allowed sources and inclusive Historical/Infra coverage totals.

#### Changed
- Actual Spend filters and CSV export now consume the same canonical, Phase 1B-mapped records.
- Completed memos remain idempotently integrated from Phase 2; Historical and Infra records are reconciled by stable source IDs.
- Invalid legacy source rows are skipped during reconciliation so they cannot block valid Actual Spend records from rendering.
- Actual Spend now defaults to a selectable data year and groups the filtered result by Project, Spend Type, and Source.
- Replaced Actual Spend KPI cards with a compact year-specific total line and project summaries.
- Removed the Overview budget KPI card and clarified the wording of the remaining KPI values.
- Actual Spend drill-down now uses responsive detail cards that fit within one view without horizontal scrolling.
- Added a downloadable Actual Spend Excel import template with valid examples, accepted values, and duplicate/validation instructions.

#### Data Flow
- Approved Memo + Historical/Manual Expense + Infra Cost → shared Actual Spend → Budget Pool mapping → filters, summary cards, drill-down, and export.

#### Remaining Work
- Forecast, Budget vs Actual, Overview, Settings, and later cleanup phases remain unchanged.

---

### Phase 4 - Overview KPI, Charts, and Filters
#### Changed
- Overview KPI actuals, monthly chart, donut breakdown, and embedded project budget-vs-actual rows now consume canonical Actual Spend records.
- Project, Spend Type, and period filters now apply consistently to every Overview actual calculation, including Infra and Other spend when present.
- Added shared coverage-period monthly allocation and range-total helpers to the financial calculation engine.
- Preserved the Forecast tab UI and rendering path; only the existing Overview forecast KPI now receives its actual/YTD inputs from canonical Actual Spend.

#### Data Flow
- Approved Memo + Historical/Manual Expense + Infra Cost → canonical Actual Spend → shared monthly allocation/range calculation → Overview filters → KPI cards and charts.

#### Tests
- Added behavioral parity coverage proving Overview KPI, chart, donut, and project comparison totals remain equal for project and Spend Type filters plus 3M, 6M, 12M, and custom periods.

#### Remaining Work
- Standalone Budget vs Actual, Forecast, Settings, exports, and cleanup remain unchanged.
# 2026-07-07 — Filter design system completion

- Standardized search, select, multi-select, date/month, and action sizing across in-scope toolbars.
- Simplified search placeholders and preserved native date/month controls.
- Kept Manual Entries compact by hiding Updated At from the list and truncating long descriptions.
- Hotfix: standardized labels above controls and removed duplicate multi-select labels.
- Simplified filter information architecture by removing low-value UAT filters and separating crowded action groups.
