-- Photographer registry + profiles, mirroring sound_engineers. Photographers
-- were previously only free text on settlements.photographer_name; this gives
-- them a table with profiles (photo/bio/instagram/contact_email) managed from a
-- new admin section and selectable on the settlement sheet. Seeds from the
-- distinct names already recorded on settlements. Additive only.
create table if not exists photographers (
  id bigint generated always as identity primary key,
  name text not null,
  photo text,
  bio text,
  instagram text,
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists photographers_name_idx on photographers (lower(name));

-- Seed from names already typed onto settlements so the list isn't empty.
insert into photographers (name)
select distinct trim(photographer_name)
from settlements
where photographer_name is not null and trim(photographer_name) <> ''
on conflict do nothing;
