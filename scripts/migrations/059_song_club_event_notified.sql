-- Track when a Song Club event blast went out, so publishing an event emails
-- interested members exactly once (a later edit won't re-blast).
alter table song_club_events add column if not exists notified_at timestamptz;
