-- Standalone expense ledger for the Admin accounting section (separate from
-- per-show Settlements, which lives in the `settlements` table). This tracks
-- general business expenses — gear, overhead, marketing — for year-end tax
-- category totals and personal bookkeeping. Cash-basis: totals roll up by
-- expense_date. Money is stored as integer cents, same convention as
-- timesheet_entries (migration 042).
--
-- An expense may optionally reference a show (on delete set null so deleting a
-- show orphans the expense rather than dropping the tax record). Category is a
-- free-text column validated against a fixed list in lib/expenses-shared.ts —
-- kept out of a CHECK constraint so the list can evolve without a migration.
create table if not exists expenses (
  id bigserial primary key,
  expense_date date not null,
  amount_cents integer not null,
  vendor text,
  category text not null,
  notes text,
  payment_method text,
  show_id bigint references shows (id) on delete set null,
  -- Public R2 URL of an uploaded receipt image/PDF, plus the original filename
  -- for display (uploads go through app/api/admin/expenses/receipt).
  receipt_url text,
  receipt_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_date_idx on expenses (expense_date desc);
create index if not exists expenses_category_idx on expenses (category);
create index if not exists expenses_show_idx on expenses (show_id);
