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
