-- Native Song Club music: members upload tracks (direct-to-R2, so no Vercel
-- body-size cap), the admin curates playlists ("rounds"), and comments attach
-- to the TRACK — so feedback follows a song wherever it appears, including
-- inside a playlist of other people's tracks. Replaces the Samply dependency.

create table if not exists song_club_tracks (
  id bigserial primary key,
  member_id bigint references song_club_members(id) on delete cascade,
  from_admin boolean not null default false,
  title text not null,
  notes text,
  url text not null,
  content_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

-- Admin-created only (v1 decision): members upload INTO rounds, they don't
-- make their own.
create table if not exists song_club_playlists (
  id bigserial primary key,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists song_club_playlist_tracks (
  playlist_id bigint not null references song_club_playlists(id) on delete cascade,
  track_id bigint not null references song_club_tracks(id) on delete cascade,
  position integer not null,
  primary key (playlist_id, track_id)
);

create table if not exists song_club_track_comments (
  id bigserial primary key,
  track_id bigint not null references song_club_tracks(id) on delete cascade,
  member_id bigint references song_club_members(id) on delete cascade,
  from_admin boolean not null default false,
  body text not null,
  -- Reserved for time-stamped feedback ("the bridge at 1:42"); no UI yet.
  timestamp_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists song_club_track_comments_track_idx
  on song_club_track_comments (track_id, created_at);
