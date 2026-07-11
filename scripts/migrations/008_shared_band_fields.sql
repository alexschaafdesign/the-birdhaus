-- Extends bands into the shared source of truth for band profile data,
-- absorbing the fields from the Twin Scene directory (previously a Google
-- Sheet). Kept separate from is_touring/hometown (007) — those track a
-- touring act's origin from Birdhaus's perspective; city/neighborhoods track
-- a local band's home turf from Twin Scene's perspective. Both can coexist.
alter table bands
  add column if not exists genres jsonb not null default '[]',
  add column if not exists city text,
  add column if not exists neighborhoods jsonb not null default '[]',
  add column if not exists members jsonb not null default '[]',
  add column if not exists contact_email text,
  add column if not exists contact_method text,
  add column if not exists website text,
  add column if not exists bandcamp text,
  add column if not exists bandcamp_embed_url text,
  add column if not exists bandcamp_embed_height integer,
  add column if not exists featured_links jsonb not null default '[]',
  -- The Twin Scene sheet row's own slug, so re-running the import later
  -- matches by stable identifier instead of fuzzy name matching.
  add column if not exists twinscene_slug text;

create index if not exists bands_twinscene_slug_idx on bands (twinscene_slug) where twinscene_slug is not null;
