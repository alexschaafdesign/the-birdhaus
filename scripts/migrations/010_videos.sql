create table if not exists videos (
  id bigserial primary key,
  youtube text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists show_videos (
  show_id bigint not null references shows (id) on delete cascade,
  video_id bigint not null references videos (id) on delete cascade,
  sort_order int not null default 0,
  primary key (show_id, video_id)
);

create index if not exists show_videos_video_id_idx on show_videos (video_id);

create table if not exists band_videos (
  band_id bigint not null references bands (id) on delete restrict,
  video_id bigint not null references videos (id) on delete cascade,
  sort_order int not null default 0,
  primary key (band_id, video_id)
);

create index if not exists band_videos_video_id_idx on band_videos (video_id);

-- Backfill: one videos row per existing shows.videos JSONB entry. Correlated
-- back to its source show/band by youtube id rather than threading ids through
-- RETURNING, since an audit confirmed every youtube id in shows.videos is
-- globally unique (no duplicates within or across shows).
insert into videos (youtube, title)
select entry ->> 'youtube', entry ->> 'title'
from shows s, jsonb_array_elements(s.videos) entry;

insert into show_videos (show_id, video_id, sort_order)
select s.id, v.id, (ord - 1)::int
from shows s, jsonb_array_elements(s.videos) with ordinality as t (entry, ord)
join videos v on v.youtube = entry ->> 'youtube'
on conflict (show_id, video_id) do nothing;

insert into band_videos (band_id, video_id, sort_order)
select (entry ->> 'bandId')::bigint, v.id,
  (row_number() over (partition by entry ->> 'bandId' order by s.date, ord) - 1)::int
from shows s, jsonb_array_elements(s.videos) with ordinality as t (entry, ord)
join videos v on v.youtube = entry ->> 'youtube'
where entry ? 'bandId'
on conflict (band_id, video_id) do nothing;
