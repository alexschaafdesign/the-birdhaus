-- Birdhaus Records catalogue: BHR-### (tape/audio) and BHV-### (video)
-- releases, linked to the night — or the one set — they came from.
--
-- No release list existed anywhere with these catalogue numbers: Birdhaus had
-- only a Bandcamp link-out, and Twin Scene's band_releases are per band with
-- no catalogue number (and live in another database). This is the label's own
-- list. A link to Twin Scene's row can be added when something uses it.
--
-- release_links: band_id null = the whole night; set = one set of it. The
-- unique constraint is NULLS NOT DISTINCT (PG 15+) so a whole-night link can't
-- be duplicated either.
--
-- Additive only; entered by SQL/script until there's an admin page.
create table if not exists releases (
  id bigint generated always as identity primary key,
  catalogue_id text not null unique check (catalogue_id ~ '^BH[RV]-[0-9]{3}$'),
  title text not null check (char_length(title) between 1 and 200),
  url text,
  release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists release_links (
  release_id bigint not null references releases (id) on delete cascade,
  show_id bigint not null references shows (id) on delete cascade,
  band_id bigint references bands (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint release_links_unique unique nulls not distinct (release_id, show_id, band_id)
);
create index if not exists release_links_show_id_idx on release_links (show_id);
