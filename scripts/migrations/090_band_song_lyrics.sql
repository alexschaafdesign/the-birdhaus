-- Yellow Ostrich lyrics: one living lyrics document per song, stored as
-- append-only full-text revisions — every save is a new row, so change
-- history is free and nothing is ever overwritten. "Current lyrics" = the
-- song's latest revision. Audio versions snapshot the then-current revision
-- at upload time (lyrics_revision_id), so each recording remembers what the
-- words were when it was made; the pin is re-pointable and survives lyric
-- edits (pointer, not copy).

create table if not exists band_song_lyrics_revisions (
  id bigint generated always as identity primary key,
  song_id bigint not null references band_songs(id) on delete cascade,
  body text not null check (char_length(body) <= 20000),
  edited_by bigint references users(id) on delete set null,
  -- Admin-session edits have no member row; mirror band_song_comments.
  from_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists band_song_lyrics_revisions_song_idx
  on band_song_lyrics_revisions (song_id, id desc);

alter table band_song_versions
  add column if not exists lyrics_revision_id bigint
    references band_song_lyrics_revisions(id) on delete set null;
