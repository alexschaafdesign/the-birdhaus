-- Yellow Ostrich groups: curated, ordered shelves of songs ("Current
-- Favorites", "Quiet Ones", ...). A song can sit in any number of groups;
-- the master list (band_songs) stays the source of truth — groups are views
-- into it, so deleting a group never touches a song. Tags remain the loose
-- descriptor taxonomy; groups are deliberate.

create table if not exists band_song_groups (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 80),
  -- Display order of the groups themselves (creation order by default).
  sort_order integer not null default 0,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists band_song_group_members (
  group_id bigint not null references band_song_groups(id) on delete cascade,
  song_id bigint not null references band_songs(id) on delete cascade,
  -- Position within the group; reorders rewrite the whole group's positions
  -- (groups are ~dozens of songs, so a full rewrite is the simple choice).
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (group_id, song_id)
);

create index if not exists band_song_group_members_song_idx
  on band_song_group_members (song_id);
