-- TV programming: turn /tv into a manually-authored CMS instead of a display
-- that derives its screens from show data + the clock. A "program" says which
-- MODE is on the tube (screensaver / board / cards) via an override, a
-- time-window schedule, or a default; each mode's content is authored, not
-- computed. Phase 1 is the global default program (show_id null); per-show
-- programs (show_id set) land in phase 2. Additive only.

-- One program per show, plus exactly one global row (show_id null) that covers
-- non-show / no-show time.
create table if not exists tv_program (
  id bigint generated always as identity primary key,
  -- null = the global default program. Non-null = that show's program (phase 2).
  show_id bigint references shows(id) on delete cascade,
  -- Mode shown when no override and no schedule window matches. One of
  -- 'screensaver' | 'board' | 'cards'.
  default_mode text not null default 'screensaver'
    check (default_mode in ('screensaver', 'board', 'cards')),
  -- Ordered time windows: [{ "from": "HH:MM" (24h venue-local), "mode": ... }].
  -- The last window whose `from` <= now wins; before the first, default_mode.
  schedule jsonb not null default '[]'::jsonb,
  -- Manual override: when set, this mode wins over the schedule until cleared.
  override_mode text check (override_mode is null or override_mode in ('screensaver', 'board', 'cards')),
  -- 'board' mode content: a title and time+label rows shown on the tube.
  board_title text,
  board_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one global row; at most one program per show.
create unique index if not exists tv_program_global_idx on tv_program ((show_id is null)) where show_id is null;
create unique index if not exists tv_program_show_idx on tv_program (show_id) where show_id is not null;

-- Seed the global default program so the feed always has one to read.
insert into tv_program (show_id, default_mode) values (null, 'screensaver')
on conflict do nothing;

-- 'cards' mode content: authored announcement cards (headline + subtext +
-- optional image), rotated on the tube. Global (show_id null) or per-show.
create table if not exists tv_cards (
  id bigint generated always as identity primary key,
  show_id bigint references shows(id) on delete cascade,
  headline text not null,
  subtext text,
  image text,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tv_cards_scope_idx on tv_cards (show_id, sort);
