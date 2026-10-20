-- Past shows are public (lib/nights.ts isPrivateBooking: only unannounced
-- shows still ahead are private), but 12 older nights — Fresh Cuts v1–v7, the
-- Shindigs, caley-conway, Kiernan/LINE — were imported before `announced` was
-- used and still read false. Mark every past show announced so the flag says
-- what the site already does. Checked on prod and dev 2026-10-07 (read-only):
-- the same 12 rows on both, all public nights.
--
-- "Past" is the show page's rule, not current_date: a night is over at 5am
-- America/Chicago the morning after, so this can't catch a show that's
-- happening the night it runs.
--
-- Updating `announced` doesn't touch date or catalogue_id, so 097's trigger
-- doesn't fire. Idempotent: a re-run matches nothing new.

update shows
set announced = true, updated_at = now()
where not announced
  and date < ((now() at time zone 'America/Chicago') - interval '5 hours')::date;
