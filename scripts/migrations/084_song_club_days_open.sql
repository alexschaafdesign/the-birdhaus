-- How much of a song-a-day's day list opens by default: just the current day,
-- the current + previous day, or every day that has happened. Rolling setting
-- per event — viewers can still toggle any day for themselves (client-side
-- only). Defaulted, so existing events behave like 'current' automatically.
alter table song_club_events
  add column if not exists days_open_default text not null default 'current'
  check (days_open_default in ('current', 'current_and_previous', 'all'));
