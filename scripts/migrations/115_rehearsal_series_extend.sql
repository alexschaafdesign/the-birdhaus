-- Rehearsal: approved series keep going past the booking window, and can be
-- open-ended ("until we end it"). Each daily run books the dates that have
-- come into the window (confirmed, no re-approval) and records the ones it
-- had to skip. Bands and Alex can end a series from a chosen date.
-- Only rehearsal_series changes (plus one new table); additive or loosening.

-- Open-ended = neither an end date nor a count. Loosens 109's either/or check.
alter table rehearsal_series drop constraint if exists rehearsal_series_check;
alter table rehearsal_series drop constraint if exists rehearsal_series_end_rule;
alter table rehearsal_series add constraint rehearsal_series_end_rule
  check (until_date is null or occurrences is null);

-- 'ended': stopped by the band or Alex; earlier sessions stay as they are.
alter table rehearsal_series drop constraint if exists rehearsal_series_status_check;
alter table rehearsal_series add constraint rehearsal_series_status_check
  check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired', 'ended'));

-- What the daily run needs to generate more sessions: the first session's
-- start (the pattern's anchor), the block length and price at request time,
-- and the request the series came in with.
alter table rehearsal_series add column if not exists anchor_starts_at timestamptz;
alter table rehearsal_series add column if not exists block_minutes int check (block_minutes between 30 and 720);
alter table rehearsal_series add column if not exists price_cents int check (price_cents between 0 and 1000000);
alter table rehearsal_series add column if not exists request_key text;
-- Ending: no sessions on or after this Chicago date.
alter table rehearsal_series add column if not exists ends_on date;
alter table rehearsal_series add column if not exists ended_at timestamptz;
alter table rehearsal_series add column if not exists ended_by text check (ended_by in ('band', 'admin'));

update rehearsal_series s set
  anchor_starts_at = f.starts_at,
  block_minutes = f.minutes,
  price_cents = f.price_cents,
  request_key = f.request_key
from (
  select distinct on (series_id) series_id, starts_at, price_cents, request_key,
         (extract(epoch from ends_at - starts_at) / 60)::int as minutes
  from rehearsal_bookings
  where series_id is not null
  order by series_id, starts_at
) f
where f.series_id = s.id and s.anchor_starts_at is null;

-- Dates a series couldn't take when they came into the window (a show,
-- blackout, busy time or another booking). Recorded once so the daily run
-- doesn't retry or re-notify them.
create table if not exists rehearsal_series_skips (
  series_id bigint not null references rehearsal_series (id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (series_id, starts_at)
);
