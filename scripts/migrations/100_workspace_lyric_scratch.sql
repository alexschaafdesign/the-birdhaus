-- Lyrics desk scratch pad: one free-text page per workspace for lines and
-- ideas that don't belong to a song yet. Same shape as
-- band_song_lyrics_revisions (latest row = current text, older rows =
-- history, autosaves fold into the latest row per writing session).

create table if not exists workspace_scratch_revisions (
  id bigint generated always as identity primary key,
  workspace_id bigint not null references workspaces(id) on delete cascade,
  body text not null check (char_length(body) <= 20000),
  edited_by bigint references users(id) on delete set null,
  from_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists workspace_scratch_revisions_ws_idx
  on workspace_scratch_revisions (workspace_id, id desc);
