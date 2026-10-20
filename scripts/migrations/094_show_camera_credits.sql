-- Recording rig + camera crew per show, for the archive's night credits.
--
-- Counts live in their own table, show_rig, NOT as columns on shows: shows is
-- read with `select *` through Neon's pooler, whose shared prepared statements
-- break ("cached plan must not change result type") when a column is added,
-- taking the site down until pooled connections recycle. See CLAUDE.md.
--
-- Counts are typed columns: they're facts about the rig, not people, and a
-- locked-off camera has no operator, so camera_count is not derived from the
-- credits below. Both nullable: unknown stays unknown (no default of 18).
--
-- show_credits holds people credits for roles that have no registry of their
-- own — 'camera' now; the role set is open and validated in code. Sound and
-- photos are NOT credited here: they keep their registries (sound_engineers,
-- photographers), which carry settlement/payment meaning. user_id optionally
-- links a credit to a crew account.
--
-- Additive only (new tables); nothing reads these until the archive adapter.
create table if not exists show_rig (
  show_id bigint primary key references shows (id) on delete cascade,
  camera_count smallint check (camera_count >= 0),
  channel_count smallint check (channel_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists show_credits (
  show_id bigint not null references shows (id) on delete cascade,
  role text not null check (char_length(role) between 1 and 40),
  name text not null check (char_length(name) between 1 and 120),
  user_id bigint references users (id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (show_id, role, name)
);
create index if not exists show_credits_user_id_idx on show_credits (user_id);
