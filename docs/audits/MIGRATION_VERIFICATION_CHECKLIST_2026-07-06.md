# Supabase Migration Verification Checklist — 2026-07-06

Purpose: determine, against the **live** Supabase project, which of the 10 committed migrations
under `supabase/migrations/` are actually applied. This settles Release Blocker B1 and the
migration-apply column of the Release Readiness Audit (`RELEASE_READINESS_AUDIT_2026-07-06.md`).

No code is changed by this checklist. Run the SQL in the Supabase SQL Editor (or `psql`) against
the live project and record PASS/FAIL per row.

---

## 0. Fast path — one query, whole repo

Run this first. It lists every column every migration in this repo expects to exist. **Zero rows
returned = every migration below is fully applied.** Any row returned names the exact
table/column that is missing, which maps 1:1 to a migration in the table below.

```sql
with expected(table_name, column_name) as (
  values
    ('user_profiles','can_review'),
    ('user_profiles','can_approve'),
    ('user_profiles','is_active'),
    ('memos','requester_profile_id'),
    ('memos','current_approver_profile_id'),
    ('memos','self_reviewed_at'),
    ('memos','source_memo_no'),
    ('devices','pbx_number'),
    ('devices','position'),
    ('devices','qa_owner'),
    ('devices','os_version'),
    ('devices','photo_url'),
    ('budget_manual_expenses','vendor_program'),
    ('memos','voided_at'),
    ('memos','voided_by'),
    ('memos','void_reason'),
    ('memos','void_evidence_url'),
    ('memos','deleted'),
    ('memos','deleted_at'),
    ('memos','deleted_by'),
    ('memos','delete_reason'),
    ('memos','hw_items'),
    ('memos','hw_owner'),
    ('memos','acct_cols'),
    ('memos','acct_rows'),
    ('memos','int_names'),
    ('memos','dep_items'),
    ('memos','currency'),
    ('memos','created_by'),
    ('memos','updated_by'),
    ('devices','created_by'),
    ('devices','updated_by'),
    ('purchase_orders','created_at'),
    ('purchase_orders','created_by'),
    ('purchase_orders','updated_by'),
    ('budget_pools','created_at'),
    ('budget_pools','created_by'),
    ('budget_pools','updated_by'),
    ('budget_manual_expenses','audit_log'),
    ('devices','deleted'),
    ('devices','deleted_at'),
    ('devices','deleted_by'),
    ('devices','audit_log'),
    ('purchase_orders','audit_log')
)
select e.table_name, e.column_name
from expected e
left join information_schema.columns c
  on c.table_schema = 'public'
  and c.table_name = e.table_name
  and c.column_name = e.column_name
where c.column_name is null
order by e.table_name, e.column_name;
```

Also run these two, which the fast-path column query can't cover (whole-table and
storage/policy checks):

```sql
-- Table existence: budget_manual_expenses (20260629161656)
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'budget_manual_expenses';

-- Storage bucket: device-photos (20260630095215)
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'device-photos';

-- Storage policies present (20260630095215) vs removed (20260630101500)
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
and policyname in
  ('device_photos_insert','device_photos_delete','device_photos_select','device_photos_update');
-- Expect exactly: device_photos_insert, device_photos_delete.
-- device_photos_select / device_photos_update present = 20260630101500 not applied.
```

---

## 1. Per-Migration Checklist

### `20260629123554_phase1_memo_workflow.sql`
| | |
|---|---|
| Table(s) affected | `user_profiles`, `memos` |
| Columns expected | `user_profiles.can_review`, `user_profiles.can_approve`, `user_profiles.is_active`, `memos.requester_profile_id`, `memos.current_approver_profile_id`, `memos.self_reviewed_at`, `memos.source_memo_no` |
| SQL check | ```sql\nselect column_name from information_schema.columns\nwhere table_schema='public' and table_name='user_profiles'\nand column_name in ('can_review','can_approve','is_active');\n\nselect column_name from information_schema.columns\nwhere table_schema='public' and table_name='memos'\nand column_name in ('requester_profile_id','current_approver_profile_id','self_reviewed_at','source_memo_no');\n``` Expect 3 rows and 4 rows respectively. |
| Risk if missing | Requester/approver profile linkage and the legacy `rejected_revision` status backfill never ran. Approval routing by profile ID would silently fall back to name-matching only; `source_memo_no` (used for Duplicate lineage) would not persist. |

---

### `20260629161656_historical_budget_expenses.sql`
| | |
|---|---|
| Table(s) affected | `budget_manual_expenses` (new table) |
| Columns expected | Whole table: `id, entry_kind, reference_no, project, budget_pool_id, expense_type, description, frequency, expense_date, start_month, end_month, quantity, unit_cost, amount, notes, created_by, updated_by, voided_at, voided_by, void_reason, created_at, updated_at` |
| SQL check | ```sql\nselect table_name from information_schema.tables\nwhere table_schema='public' and table_name='budget_manual_expenses';\n\nselect count(*) from public.budget_manual_expenses;\n``` First query returns 1 row if the table exists; second confirms it's queryable (RLS/grants correct). |
| Risk if missing | Every Manual Actual Spend / Historical Expense entry (Budget & Spend > Actual Spend > Manual Entries) has nowhere to persist — the entire Manual Entries feature would be local-only, and Actual Spend totals involving historical/manual records would not survive a reload. |

---

### `20260630095215_device_fields_storage_status.sql`
| | |
|---|---|
| Table(s) affected | `devices`; `storage.buckets` / `storage.objects` policies |
| Columns expected | `devices.pbx_number`, `devices.position`, `devices.qa_owner`, `devices.os_version`, `devices.photo_url`; `devices.status` default `'not_identified'`; storage bucket `device-photos` |
| SQL check | ```sql\nselect column_name, column_default from information_schema.columns\nwhere table_schema='public' and table_name='devices'\nand column_name in ('pbx_number','position','qa_owner','os_version','photo_url','status');\n\nselect id, public, file_size_limit from storage.buckets where id='device-photos';\n\nselect policyname from pg_policies\nwhere schemaname='storage' and tablename='objects'\nand policyname in ('device_photos_insert','device_photos_delete');\n``` Expect 6 column rows (status default = `not_identified`), 1 bucket row, 2 policy rows. |
| Risk if missing | Device photo upload fails outright (no bucket/policy) or extended device fields (PBX number, position, QA owner, OS version) don't persist — Device Add/Edit would silently drop this data on reload. |

---

### `20260630101500_tighten_device_photo_policies.sql`
| | |
|---|---|
| Table(s) affected | `storage.objects` policies only (no table columns) |
| Columns expected | N/A — drops `device_photos_select` and `device_photos_update` storage policies |
| SQL check | ```sql\nselect policyname from pg_policies\nwhere schemaname='storage' and tablename='objects'\nand policyname in ('device_photos_select','device_photos_update');\n``` Expect **0 rows**. Any row returned means this migration has not been applied. |
| Risk if missing | Security hardening gap only (overly-permissive select/update policy on the `device-photos` bucket remains active) — not a functional/data-loss risk, but should still be confirmed and closed before production. |

---

### `20260701090000_add_manual_expense_vendor_program.sql`
| | |
|---|---|
| Table(s) affected | `budget_manual_expenses` |
| Columns expected | `vendor_program` |
| SQL check | ```sql\nselect column_name from information_schema.columns\nwhere table_schema='public' and table_name='budget_manual_expenses'\nand column_name='vendor_program';\n``` Expect 1 row. |
| Risk if missing | Vendor/Program field on Manual Entries doesn't persist to Supabase. App has a known column-missing fallback for this specific column (per TD-M2-03's precedent reference) so the write likely degrades gracefully rather than failing outright — confirm this in code (`views/budget.js`) if this row is missing before assuming zero impact. |

---

### `20260703140000_memo_void_and_soft_delete.sql` — **flagged OPEN in TD-M1-03**
| | |
|---|---|
| Table(s) affected | `memos` |
| Columns expected | `voided_at`, `voided_by`, `void_reason`, `void_evidence_url`, `deleted`, `deleted_at`, `deleted_by`, `delete_reason` |
| SQL check | ```sql\nselect column_name from information_schema.columns\nwhere table_schema='public' and table_name='memos'\nand column_name in\n  ('voided_at','voided_by','void_reason','void_evidence_url','deleted','deleted_at','deleted_by','delete_reason');\n``` Expect 8 rows. |
| Risk if missing | **High.** Void and Draft soft-delete both fall back to local-only persistence — they appear to work in the current session but do not survive a real reload. This is the direct root cause of **TD-AUDIT-03** (Voided memo's Actual Spend can silently resurrect). |

---

### `20260703150000_memo_detail_restore.sql` — **flagged OPEN in TD-M1-04**
| | |
|---|---|
| Table(s) affected | `memos` |
| Columns expected | `hw_items`, `hw_owner`, `acct_cols`, `acct_rows`, `int_names`, `dep_items` |
| SQL check | ```sql\nselect column_name from information_schema.columns\nwhere table_schema='public' and table_name='memos'\nand column_name in ('hw_items','hw_owner','acct_cols','acct_rows','int_names','dep_items');\n``` Expect 6 rows. |
| Risk if missing | **High.** Every Save Draft / Submit (all memo types, since `memoToDb()` writes one flat row) persists these fields locally only. Re-edit/Duplicate of a memo saved before this migration is applied would come back missing Hardware rows, Account table, Internal participant names, or Deployment line items after a real reload. |

---

### `20260703160000_milestone2_financial_foundation.sql` — **flagged OPEN in TD-M2-01**
| | |
|---|---|
| Table(s) affected | `memos`, `devices`, `purchase_orders`, `budget_pools` |
| Columns expected | `memos.currency`, `memos.created_by`, `memos.updated_by`, `devices.created_by`, `devices.updated_by`, `purchase_orders.created_at`, `purchase_orders.created_by`, `purchase_orders.updated_by`, `budget_pools.created_at`, `budget_pools.created_by`, `budget_pools.updated_by` |
| SQL check | ```sql\nselect table_name, column_name from information_schema.columns\nwhere table_schema='public'\nand (\n  (table_name='memos' and column_name in ('currency','created_by','updated_by'))\n  or (table_name='devices' and column_name in ('created_by','updated_by'))\n  or (table_name='purchase_orders' and column_name in ('created_at','created_by','updated_by'))\n  or (table_name='budget_pools' and column_name in ('created_at','created_by','updated_by'))\n)\norder by table_name, column_name;\n``` Expect 11 rows total. |
| Risk if missing | Currency (always `'THB'` today) and Created By / Updated By audit metadata across 4 tables persist locally only — audit/troubleshooting metadata required by `SYSTEM_OVERVIEW.md` §5 would be unreliable after a reload. |

---

### `20260703170000_manual_expense_audit_log.sql` — **flagged OPEN in TD-M2-03**
| | |
|---|---|
| Table(s) affected | `budget_manual_expenses` |
| Columns expected | `audit_log` (jsonb) |
| SQL check | ```sql\nselect column_name, data_type from information_schema.columns\nwhere table_schema='public' and table_name='budget_manual_expenses'\nand column_name='audit_log';\n``` Expect 1 row, `data_type = jsonb`. |
| Risk if missing | Lower risk than most — the app already retries once without `audit_log` on the specific missing-column error, so Create/Edit/Void of Manual Entries still persist their other fields. Only the audit timeline itself stays local-only until applied. |

---

### `20260703180000_device_registry_m3b.sql` — **flagged OPEN in TD-M3B-01**
| | |
|---|---|
| Table(s) affected | `devices`, `purchase_orders` |
| Columns expected | `devices.deleted`, `devices.deleted_at`, `devices.deleted_by`, `devices.audit_log`, `purchase_orders.audit_log` |
| SQL check | ```sql\nselect table_name, column_name from information_schema.columns\nwhere table_schema='public'\nand (\n  (table_name='devices' and column_name in ('deleted','deleted_at','deleted_by','audit_log'))\n  or (table_name='purchase_orders' and column_name = 'audit_log')\n)\norder by table_name, column_name;\n``` Expect 5 rows. |
| Risk if missing | `audit_log` on both tables has the same graceful retry-without-column fallback as above. **`devices.deleted`/`deleted_at`/`deleted_by` do not** — a Device delete's Supabase PATCH fails outright until this migration is applied, and the soft delete persists locally only (in-memory cache + localStorage). |

---

## 2. Baseline Schema Gap (separate from apply-status above)

Per TD-M1-01 / TD-7A-06, there is **no committed `create table` migration** anywhere in this repo
for: `memos`, `user_profiles`, `devices`, `purchase_orders`, `budget_pools`, `infra_costs`. This is
true regardless of whether the 10 migrations above are applied — it means the schema for these 6
tables cannot be reconstructed from `supabase/migrations/` alone.

Recommended one-time check to close this gap (not a per-migration risk, a whole-project one):

```sql
-- Full current schema dump for the 6 undocumented-baseline tables, for the incoming team to diff
-- against and eventually commit as a baseline migration.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
and table_name in ('memos','user_profiles','devices','purchase_orders','budget_pools','infra_costs')
order by table_name, ordinal_position;
```

---

## 3. How to Use This Checklist

1. Run §0's fast-path query first. If it returns zero rows and the two follow-up storage/table
   checks pass, every migration in this repo is applied — update TD-M1-03/TD-M1-04/TD-M2-01/
   TD-M2-03/TD-M3B-01 in `docs/TECHNICAL_DEBT.md` to CLOSED and close Release Blocker B1/B2 in the
   readiness audit.
2. If §0 returns rows, look up each `(table_name, column_name)` pair in §1 to identify which
   migration(s) are not applied, and apply exactly those migration files (in filename/timestamp
   order) to the live Supabase project.
3. Run §2's schema dump once regardless of the above, and commit the result as the missing
   baseline migration (or attach it to the handoff package) to close B4.
4. Re-run §0 after applying anything, to confirm zero rows before moving on to UAT.
