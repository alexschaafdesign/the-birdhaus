-- Yellow Ostrich band workspace: private song triage for the album. Songs
-- carry a status + freeform tags; each song holds multiple audio versions
-- (voice memo, demo v2, ...) uploaded direct-to-R2 like Song Club tracks;
-- comments hang off the SONG, optionally pinned to a specific version.
--
-- Unlike Song Club, user FKs are ON DELETE SET NULL rather than cascade:
-- this is the band's archive, and removing an account must never delete
-- songs, versions, or feedback. Null authors render as "Former member".

-- Admit the new 'band' role. The check was created inline in 058, so
-- Postgres auto-named it user_roles_role_check.
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles add constraint user_roles_role_check
  check (role in ('song_club', 'crew', 'staff', 'band'));

create table if not exists band_songs (
  id bigserial primary key,
  title text not null,
  -- Album-triage pipeline: idea -> demo -> in_progress -> contender | cut.
  status text not null default 'idea'
    check (status in ('idea', 'demo', 'in_progress', 'contender', 'cut')),
  -- Freeform taxonomy; categories and vibes both live here
  -- ('upbeat', 'ballad', 'needs-bridge').
  tags text[] not null default '{}',
  notes text,
  pinned boolean not null default false,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Touched on metadata edits and new version uploads, so "recently
  -- active" sorting works.
  updated_at timestamptz not null default now()
);

create table if not exists band_song_versions (
  id bigserial primary key,
  song_id bigint not null references band_songs(id) on delete cascade,
  label text not null,
  url text not null,
  content_type text,
  size_bytes bigint,
  peaks jsonb,
  duration_seconds real,
  uploaded_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists band_song_versions_song_idx
  on band_song_versions (song_id, created_at);

create table if not exists band_song_comments (
  id bigserial primary key,
  song_id bigint not null references band_songs(id) on delete cascade,
  -- set null so deleting a bad upload doesn't nuke the discussion
  version_id bigint references band_song_versions(id) on delete set null,
  member_id bigint references users(id) on delete set null,
  from_admin boolean not null default false,
  body text not null,
  timestamp_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists band_song_comments_song_idx
  on band_song_comments (song_id, created_at);
