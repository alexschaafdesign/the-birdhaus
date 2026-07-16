-- Sound engineer registry — a persistent list of engineers so the show form
-- can suggest previously-used names (borrow-or-create at save time, mirroring
-- the bands registry in 006_bands.sql / lib/bands.ts).
create table if not exists sound_engineers (
  id bigserial primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sound_engineers_name_idx on sound_engineers (lower(name));

-- Per-show engineer relationships with a status. Exactly one 'confirmed' row
-- per show is the assigned engineer; 'asked'/'declined' track outreach so an
-- upcoming show without a confirmed engineer still records who was asked.
create table if not exists show_sound_engineers (
  show_id bigint not null references shows (id) on delete cascade,
  sound_engineer_id bigint not null references sound_engineers (id) on delete restrict,
  status text not null default 'asked' check (status in ('confirmed', 'asked', 'declined')),
  created_at timestamptz not null default now(),
  primary key (show_id, sound_engineer_id)
);

create index if not exists show_sound_engineers_engineer_idx on show_sound_engineers (sound_engineer_id);

-- At most one confirmed engineer per show.
create unique index if not exists show_sound_engineers_one_confirmed
  on show_sound_engineers (show_id) where status = 'confirmed';
