-- A round (playlist) can have a cover image (flyer/art), and a public Song
-- Club event can link to its round so attendees can jump to the music.
alter table song_club_playlists add column if not exists image_url text;
alter table song_club_events
  add column if not exists playlist_id bigint references song_club_playlists(id) on delete set null;
