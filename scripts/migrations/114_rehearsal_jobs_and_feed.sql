-- Rehearsal Phase 5: the daily job's bookkeeping and Alex's private calendar
-- feed. Additive; new columns and new tables only.

-- Each email the daily job sends about a booking goes out once.
alter table rehearsal_bookings add column if not exists reminder_sent_at timestamptz;      -- band's day-before reminder
alter table rehearsal_bookings add column if not exists expiry_notified_at timestamptz;    -- "your request lapsed"
alter table rehearsal_bookings add column if not exists conflict_notified_at timestamptz;  -- Alex told about the conflict

-- One row per Chicago day the daily job ran, so Alex's morning email goes
-- out once a day even if the cron (or "Run now") fires twice.
create table if not exists rehearsal_daily_runs (
  day date primary key,
  ran_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

-- Alex's private feed of confirmed rehearsals (Apple Calendar etc.). Same
-- token model as booking_calendar_feeds (105): one live token, reset = revoke
-- and mint.
create table if not exists rehearsal_calendar_feeds (
  id bigint generated always as identity primary key,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists rehearsal_calendar_feeds_one_live
  on rehearsal_calendar_feeds ((true)) where revoked_at is null;
