-- Multi-day events (e.g. a 10-day Song-a-day). event_date is the start;
-- end_date is an optional end. Single-day events leave end_date null.
alter table song_club_events add column if not exists end_date date;
