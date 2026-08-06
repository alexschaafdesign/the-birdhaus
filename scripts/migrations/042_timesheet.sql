-- Timesheet — hours logged by admin helpers, paid hourly. Replaces the shared
-- Google Sheet. Not tied to any single show: what the venue pays a helper is a
-- venue-level operating expense, folded into the Settlements yearly summary
-- (see app/api/admin/settlements/summary) on a PAID basis — an entry counts
-- toward a period's expense when it was marked paid in that period (paid_date),
-- which is the cash-basis number that matters for taxes ("how much I paid them
-- this year"). Admin-gated by the shared single-operator session (proxy.ts).
create table timesheet_entries (
  id           bigserial primary key,
  worker_name  text not null,
  work_date    date not null,
  clock_in     time not null,
  clock_out    time not null,        -- may be earlier than clock_in for a shift past midnight; hours wrap +24h
  rate_cents   integer not null,     -- hourly rate in cents (e.g. 2000 = $20/hr), snapshotted per entry
  note         text,
  paid         boolean not null default false,
  paid_date    date,                 -- when it was paid; drives the tax-year expense. Null until paid.
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index timesheet_entries_work_date_idx on timesheet_entries (work_date);
create index timesheet_entries_paid_date_idx on timesheet_entries (paid_date);
