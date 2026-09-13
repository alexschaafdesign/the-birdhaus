-- Song Club groups: a song-a-day event can be split into small groups, each
-- with its own page, board, and day-by-day song list. A track is NOT stored
-- against a group — its group is derived at query time from the uploader's
-- group_id on song_club_event_attendees, so moving a person moves all their
-- songs with zero track-level writes. Everything here is nullable/defaulted:
-- an event with no groups renders exactly as before.

create table if not exists song_club_groups (
  id bigserial primary key,
  event_id bigint not null references song_club_events(id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (event_id, position)
);

-- Which group an attendee belongs to (null = not yet assigned).
alter table song_club_event_attendees
  add column if not exists group_id bigint references song_club_groups(id) on delete set null;

-- Scope board posts one level deeper: event_id + null group_id = the event's
-- announcement board; event_id + group_id = that group's board. Same pattern
-- as migration 061's event_id scoping.
alter table song_club_posts
  add column if not exists group_id bigint references song_club_groups(id) on delete set null;

-- Which day of the song-a-day a track belongs to (uploader-chosen; null on
-- old rounds, which keep rendering flat), and the admin's highlight star.
alter table song_club_playlist_tracks
  add column if not exists day date;
alter table song_club_playlist_tracks
  add column if not exists is_highlight boolean not null default false;

create index if not exists song_club_event_attendees_event_group_idx
  on song_club_event_attendees (event_id, group_id);
create index if not exists song_club_posts_event_group_idx
  on song_club_posts (event_id, group_id, created_at);
create index if not exists song_club_playlist_tracks_day_idx
  on song_club_playlist_tracks (playlist_id, day);
