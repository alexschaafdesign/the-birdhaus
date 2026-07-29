-- An unguessable per-show token for the shareable band/engineer "show hub" page
-- (/hub/<token>), which lives outside the admin auth gate. Nullable + lazily
-- generated the first time the admin opens the share link; regenerating rotates
-- it (revoking the old link). Unique so a token maps to exactly one show.
alter table shows
  add column if not exists share_token text;

create unique index if not exists shows_share_token_idx
  on shows (share_token) where share_token is not null;
