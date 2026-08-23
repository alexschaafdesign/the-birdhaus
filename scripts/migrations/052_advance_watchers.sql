-- Editable "advance watchers" list — the people CC'd on every outbound advance /
-- thread message and notified of portal activity, replacing the hardcoded
-- alex@thebirdhaus.org (DEFAULT_ADVANCE_WATCHER in lib/advance-email.ts, which
-- now only seeds this). Singleton row holding a jsonb array of emails, seeded
-- lazily in code (lib/advance-watchers.ts) the first time it's read, mirroring
-- portal_info (045). Edited in the admin Settings screen.
create table if not exists advance_watchers (
  id bigserial primary key,
  emails jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default row (mirrors portal_info_one_default in 045).
create unique index if not exists advance_watchers_one_default
  on advance_watchers (is_default) where is_default;
