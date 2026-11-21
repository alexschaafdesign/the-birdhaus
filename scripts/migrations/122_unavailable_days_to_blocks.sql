-- Booking's per-day "Not available" folds into blocks (rehearsal_blackouts),
-- which are now managed from the master admin Calendar and close a day for
-- everything. Each Not-available day becomes an all-day block (Chicago
-- midnight to midnight) with the day's title as its note.
--
-- Data only, no schema change. booking_days.unavailable is left as it was (the
-- new code stops reading it; nothing is lost if this needs undoing). Skips any
-- day that already has an identical block, so a re-run adds nothing.
insert into rehearsal_blackouts (starts_at, ends_at, note)
select (d.date::timestamp at time zone 'America/Chicago'),
       ((d.date + 1)::timestamp at time zone 'America/Chicago'),
       left(d.title, 500)
from booking_days d
where d.unavailable
  and not exists (
    select 1 from rehearsal_blackouts b
    where b.starts_at = (d.date::timestamp at time zone 'America/Chicago')
      and b.ends_at = ((d.date + 1)::timestamp at time zone 'America/Chicago')
  );
