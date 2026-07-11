create table if not exists show_bands (
  show_id bigint not null references shows (id) on delete cascade,
  band_id bigint not null references bands (id) on delete restrict,
  sort_order int not null default 0,
  primary key (show_id, band_id)
);

create index if not exists show_bands_band_id_idx on show_bands (band_id);

insert into show_bands (show_id, band_id, sort_order)
select s.id, (entry ->> 'bandId')::bigint, (ord - 1)::int
from shows s, jsonb_array_elements(s.bands) with ordinality as t (entry, ord)
on conflict (show_id, band_id) do nothing;
