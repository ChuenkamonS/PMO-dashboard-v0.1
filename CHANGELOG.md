# CHANGELOG

## Phase 7A-9E — Budget Pool overlap allowed (business rule update) (2026-07-02)

### Changed
- Overlapping Budget Pools (same Project + Spend Type + Period) are now explicitly allowed. Reason: PMO may intentionally create multiple buckets with the same Project, Spend Type, and Period to separate budget purposes.
- Manual Add/Edit (`saveBudgetPool()`, `views/budget.js`): removed the `confirm()` warning dialog for overlapping Project + Spend Type + Period — an overlapping pool now saves immediately, with no prompt.
- Bulk Upload / Bulk Update (`validateBudgetPoolImportBatch()`, `app.js`): removed the `errors.push('Overlaps existing Budget Pool(s)...')` escalation — overlap no longer fails a row or blocks the workbook (all-or-nothing still applies, but only to real errors: invalid month, negative budget, unknown Pool ID, duplicate Pool ID, duplicate identity, invalid Spend Type).
- Removed the now-inaccurate "Overlapping Pool" row from the Bulk Upload workbook's Instructions sheet Common Errors table; added a short note explaining overlap is allowed by design.
- `validateBudgetPoolChange()`'s `conflicts` field is unchanged (still computed) but is no longer treated as blocking by either caller — it is informational only.

### Unchanged (verified, not touched)
- Exact duplicate business identity (Project + Pool Name + Budget Year) still blocks in both manual add/edit and bulk import — unchanged.
- Canonical automatic mapping (`mapBudgetPool()`, `findMatchingBudgetPools()`, `app.js`) is untouched: manual override (`manualBudgetPoolId`/`finalBudgetPoolId`) is still always respected; an Actual Spend record matching exactly one pool still auto-maps (`Mapped`); a record matching more than one pool still becomes `Needs PMO Review` with no auto-pick — so allowing overlapping pools can never cause double-counting, a record still resolves to exactly one final Budget Pool or `Needs PMO Review`.
- Pool ID Create/Update decision logic, Export/Template workflow (columns, sheets, round-trip contract), and Lifecycle/Archive/Delete are all unchanged — out of scope per this update.
- `docs/BvA_REQUIREMENT.md` §8 amended in place (Phase 7A-9E note) rather than silently left contradicting the code, per that document's own "wins unless a future phase explicitly amends it" rule.

### Tests
- Replaced the 3 tests that pinned the old overlap-blocks behavior (`tests/financial-models.test.js`, `tests/budget-expenses.test.js`) with tests confirming overlap is now accepted (manual save with no confirm, bulk Create, bulk Update, and multiple overlapping pools created together in one workbook), plus a dedicated test that exact duplicate identity still blocks. Full suite: 253/253 passing (was 248; net +5 new/replaced tests).

## Phase 7A-9D — Budget Pool Bulk Upload redesign: one workbook, Create + Update (2026-07-02)

### Changed
- Replaced the CSV "one example row per project" Download Template with a real `.xlsx` workbook (SheetJS) containing the Budget Pools currently visible under Budget Settings' active filters (today: Budget Year), each with its real Pool ID, plus an Instructions sheet documenting the workflow and common errors.
- Bulk Upload now supports Create and Update in a single workbook: **Pool ID** (new column) is the only signal that decides Update vs. Create — a blank Pool ID always creates, a Pool ID matching an existing pool updates that exact pool. Business identity `(Project, Pool Name, Budget Year)` uniqueness is still enforced via the existing shared `validateBudgetPoolChange()`, but no longer used to infer which pool a row updates.
- Sheet 1 column order is fixed: `Pool ID, Project, Pool Name, Budget, Budget Year (BE), Start Month, End Month, Spend Types`.
- Added a true no-op "No Changes" classification: a row whose Pool ID matches an existing pool and whose every effective field is identical is neither created nor updated — no save, no audit-field change, no remap — satisfying the Download → Upload-unmodified round-trip contract.
- Preview and error modals now show Pool ID and a Created/Updated/No Changes/Errors summary; Update rows whose Period or Budget Year changed show an inline mapping-impact warning.
- `#pool-excel-upload` now accepts `.xlsx` only (previously `.xlsx,.xls`).
- Extracted `visibleBudgetSettingsPools()` (`views/budget.js`) as the single source for "what's visible under Budget Settings' active filters," shared by `renderBudgetSettings()` and Download Template, so a future filter (Project/Spend Type/Search) needs updating in one place.
- Spend Types column accepts canonical names (Software, Hardware, Team Activity, Client Expense, Deployment, Infra, Others) and legacy short codes (SL, HW, INT, ENT, DEP, plus INFRA/OTHER) — closing a pre-existing gap where bulk import could not set Infra/Others. The previous "Memo Types" header remains readable for backward compatibility. An unrecognized token now surfaces an explicit "Invalid Spend Type" row error instead of being silently dropped.

### Fixed
- Bulk-imported Update rows now preserve the existing pool's `createdBy`/`createdAt` and only refresh `updatedBy`/`updatedAt` (previously every bulk-updated pool silently got a fresh `createdAt` and blank `createdBy`).

### New errors
- `Unknown Pool ID`, `Duplicate Pool ID` (same Pool ID used twice in one file), and a specific "Existing Budget Pool detected, but Pool ID is blank" message (in addition to the existing generic duplicate-identity message) when a blank-Pool-ID row's identity collides with an existing pool.

### Unchanged
- All-or-nothing validation, `validateBudgetPoolRecord()`/`validateBudgetPoolChange()` as the single validators, overlap-conflict detection, year derivation from Start/End Month, `savePoolAsync()`/batch-remap-once behavior, and every other Budget & Spend tab (Overview, Actual Spend, Forecast, Budget vs Actual). No Lifecycle/Archive/Delete/Dashboard/Health Check/Supabase changes.

### Tests
- Added/updated coverage in `tests/financial-models.test.js` and `tests/budget-expenses.test.js` for: Pool-ID-driven Create/Update classification, Unknown Pool ID, Duplicate Pool ID, blank-ID-matches-existing-identity, Duplicate Identity after Update, No Changes (validator level and full `handlePoolBulkUpload`→`_confirmPoolImport` pipeline — no save/audit/remap), audit preservation on Update and fresh audit on Create, backward-compatible Spend Type parsing (canonical names, legacy short codes, mixed, invalid token), Download Template shape (`.xlsx`, sheet names, column order, Pool ID inclusion, year-filter scoping), the full Download→Upload-unmodified round trip, and preview/error summary counts. Full suite: 248/248 passing.

## Phase 4 completion verification (2026-07-01)

### Completed
- Preserved Manual Notes independently in canonical Actual Spend records and Report Detail.
- Preserved locally saved Vendor / Program during reloads from Supabase environments whose schema cache does not yet expose `vendor_program`.
- Displayed the already-mapped final Budget Pool name in read-only Actual Spend Report Detail without changing mapping or Budget vs Actual behavior.

### Tests
- Added behavioral create/edit/reload persistence, schema-lag compatibility, canonical Notes, and Report Detail Budget Pool coverage.

### Unchanged
- Budget Pool mapping and validation, Budget vs Actual, Forecast, import contract, Report calculations, and canonical financial calculations.

## Actual Spend import frequency inference fix (2026-07-01)

### Fixed
- Manual Entries imports now infer frequency from normalized calendar-month coverage, so both `YYYY-MM` and full-date ranges spanning multiple inclusive months persist as Monthly.
- Same-day and single-month records remain One-time.
- Monthly imported Amount continues to be divided by inclusive coverage months before manual persistence, preserving canonical Report and Forecast totals.

### Unchanged
- Import template, columns, parser contract, Report, Forecast, Budget vs Actual, Budget Pool mapping, and canonical financial calculations.

### Tests
- Added month-only, full-date, Excel serial, Date-object, one-day, Manual frequency, canonical total, and Forecast parity coverage.

## Phase 4 — Manual Actual Spend modal and amount alignment (2026-07-01)

### Changed
- Renamed the manual add/edit workflow to Manual Actual Spend and aligned its Reference No, Spend Type, Description, Frequency, and save labels.
- Removed Entry Type, Quantity, and Unit Cost from the modal while retaining their compatible persistence values internally.
- Added frequency-aware Amount / Monthly Amount entry and an inclusive-month live Estimated Total preview.
- Added an independent Vendor / Program field to manual persistence and canonical Actual Spend projection.

### Compatibility
- Existing stored `amount` remains authoritative; one-time records store the total and monthly records store the monthly amount.
- New saves continue writing `quantity = 1` and `unitCost = amount` for the existing Supabase schema.
- Import columns, template, parser, and coverage-total semantics remain unchanged.
- Manual saves retry without `vendor_program` only when Supabase reports the specific PGRST204 missing-column schema-cache error, while retaining Vendor / Program locally until the migration is visible.

### Migration
- Added an additive `vendor_program` column to `budget_manual_expenses`.

### Tests
- Added modal contract, single-path preview calculation, legacy amount, Vendor / Program persistence, schema-cache fallback, import compatibility, parity, and additive migration coverage.

## Manual Entries import routing fix (2026-07-01)

### Fixed
- Actual Spend files imported from the Manual Entries workflow now normalize every row to editable Manual / Historical persistence, regardless of the Excel Source value.
- Imported Infra rows retain Spend Type `Infra`, appear in Manual Entries and canonical Report, and support the existing edit and soft-delete flow.
- Source normalization occurs before duplicate validation so repeat Manual Entries imports remain detectable.
- Existing direct-canonical and legacy Infra Cost records remain supported.

### Tests
- Added mixed-Source routing, imported-Infra edit/delete and total updates, and legacy direct-canonical Infra regression coverage.

## Actual Spend Excel date parsing fix (2026-07-01)

### Fixed
- Actual Spend import now normalizes Excel serial date values and SheetJS `Date` objects before strict calendar validation.
- Excel cells representing first-of-month ranges retain month precision, while full dates retain day precision.
- Existing `YYYY-MM` and `YYYY-MM-DD` strings and matching-precision validation remain unchanged.

### Tests
- Added coverage for Excel serial full dates, Excel serial month ranges, Date objects, invalid date text, and mixed-precision rejection.

## Manual Entries Delete confirmation fix (2026-07-01)

### Fixed
- Removed the unintended second reason prompt that could cancel Delete after the user had already confirmed.
- Delete now uses `Deleted from Manual Entries` as its audit reason, soft-deletes the persisted manual-expense ID, and rerenders/reconciles canonical Actual Spend immediately.
- Added UI-button wiring coverage for both manually added and Excel-imported manual records, plus success, cancellation, persistence-failure, and canonical-total regression coverage.

## Phase 3.2 — Manual Entries QA fixes (2026-07-01)

### Changed
- Removed the manual internal-ID fallback from canonical Reference No; blank references remain blank in data and display as `—` in Manual Entries and Report details.
- Made Manual Entries Delete an explicit soft-delete flow with clear confirmation, a default audit reason, cancellation feedback, transactional remote/local behavior, and clear failure feedback.
- Reduced the Manual Entries table to nine summary columns and kept schedule, Budget Pool, creator, notes, and creation method in View Detail.
- Reconfirmed Actual Spend Report drill-down/detail remains read-only with no Edit, Delete, or Void actions.

### Unchanged
- Manual Add/Edit fields and wording, Entry Type, Quantity/Unit Cost, import template/parser, amount semantics, date/month pickers, exports, calculations, Report grouping/totals, Budget Pools, Forecast, BvA, Spend Types, and legacy records.

### Tests
- Added wrapper-level soft-delete success/failure coverage, canonical total exclusion, internal-ID leakage regression coverage, and compact table/detail contract checks.

## Phase 3.1 — Manual QA UI fixes (2026-07-01)

### Changed
- Formatted Manual Entries Created At and Updated At values as user-friendly local date/time text instead of raw ISO timestamps.
- Applied the same audit timestamp formatting to read-only Actual Spend Report details.
- Shortened the Manual Entries search placeholder without changing search behavior.
- Verified Report detail remains informational only, with no Edit, Delete, or Void actions.

### Unchanged
- Financial calculations, persistence, CRUD behavior, imports/templates, exports, filters, Report grouping, Budget Pools, Forecast, Budget vs Actual, and date/month pickers.

### Tests
- Added focused UI coverage for timestamp formatting and the shorter search placeholder; retained read-only Report detail coverage.

## Phase 3 — Manual Entries management and read-only Report (2026-07-01)

### Changed
- Added a flat Manual Entries management table sourced only from active manual-expense persistence, including manually added and Excel-imported manual records.
- Added search and project, spend type, frequency, coverage date, and budget status filters plus View Detail, Edit, and soft Delete actions.
- Kept soft-deleted manual records hidden and excluded from canonical Actual Spend and downstream totals.
- Removed maintenance actions and edit routing from Actual Spend Report drill-down/detail; manual report details now direct users to Manual Entries.
- Made Reference No optional and display blank references as `—` without exposing internal record IDs.
- Kept the import template columns, parser, amount/date semantics, form layout, Report grouping/totals, Forecast, Budget vs Actual, Budget Pool CRUD, Spend Types, and legacy support unchanged.

### Tests
- Added targeted coverage for Manual Entries source isolation, active-only behavior, actions/filters, soft deletion, optional references, and read-only Report details.

## Phase 2 — Separate Actual Spend report and manual maintenance (2026-07-01)

### Changed
- Added Report and Manual Entries sub-tabs under Actual Spend.
- Kept the grouped report, filters, totals, drill-down, and existing report CSV export together in Report.
- Moved Add Actual Spend, Import Excel, and Download Template into Manual Entries without changing their handlers or permissions.
- Kept the existing 9-column import template, parser, amount semantics, and Phase 1 editable/soft-deletable persistence unchanged.

### Tests
- Added targeted coverage for the default Report tab, sub-tab visibility, and maintenance-action placement.

## Phase 1 import template verification (2026-07-01)

### Verified
- The downloaded Actual Spend workbook uses the parser's canonical columns exactly: Source, Reference No, Spend Type, Project, Amount, Start Date, End Date, Vendor / Program, and Description.
- Both workbook examples parse and validate successfully.
- `YYYY-MM` and `YYYY-MM-DD` are supported and documented; Start Date and End Date must use the same format.
- `Others` remains valid because it is part of the shared Spend Type master. Unknown values are rejected.
- New Manual / Historical imports continue through editable manual-expense persistence and support soft deletion.

### Tests
- Added regression coverage for the exact template header contract, both date formats, template sample validation, and the valid `Others` Spend Type.
- No production behavior or UI was changed.

## Revised Phase 1 — Unify Actual Spend Excel import persistence (2026-07-01)

### Scope
Route **new** Actual Spend Excel imports whose `Source` is "Manual / Historical" into the
existing manual expense persistence path (`orbit-pmo-manual-expenses-v1`), so imported rows
become editable and soft-deletable exactly like manually added rows. Imports with `Source`
"Approved Memo" or "Infra Cost" are unchanged — they continue to write directly to canonical
Actual Spend as read-only reporting records, preserving legacy behavior.

### Files changed
- `views/budget.js`
- `tests/budget-expenses.test.js`

### What changed
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

### Data flow
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

### Explicitly NOT changed
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

### Tests
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

### Test run
- Ran `node --test tests/budget-expenses.test.js tests/financial-models.test.js tests/workflow.test.js`.
- Result: 65 passed, 0 failed.
- JavaScript syntax checks passed for `app.js` and `views/budget.js`.

### Remaining work
- Entry Type field cleanup (possible removal of "Adjustment"/"Other" options) deferred to a later
  UI cleanup phase, per scope.
- Report / Manual Entries sub-tab split deferred, per scope.
