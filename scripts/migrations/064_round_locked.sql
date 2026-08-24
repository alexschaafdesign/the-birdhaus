-- A round can be "locked": members can see/listen but can't upload until the
-- admin opens it (e.g. a Song-a-day that hasn't started). Existing rounds stay
-- open (default false); event rounds are created locked (see the playlists API).
alter table song_club_playlists add column if not exists locked boolean not null default false;
