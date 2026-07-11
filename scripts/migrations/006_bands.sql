-- Band registry. Per-show appearances stay embedded in shows.bands jsonb
-- (see 005_shows.sql); each entry there optionally links to a row here via
-- a `bandId` key, borrowed/created at save time (see lib/bands.ts).
create table if not exists bands (
  id bigserial primary key,
  slug text not null unique,
  name text not null,
  instagram text,
  bio text,
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bands_name_idx on bands (lower(name));
