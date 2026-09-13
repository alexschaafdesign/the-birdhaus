-- Stable per-group URL slug. The group page was addressed by slugifying the
-- group's name at request time, so renaming a group would silently change its
-- URL and break links already shared in the boards. Give each group a slug set
-- once at creation and never rewritten on rename.
alter table song_club_groups add column if not exists slug text;

-- Backfill existing groups from their current name, de-duplicated per event
-- (position keeps ties deterministic).
update song_club_groups g set slug = sub.slug
from (
  select id,
         case when cnt = 1 then base else base || '-' || rn end as slug
  from (
    select id, event_id,
           regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g') as base,
           row_number() over (partition by event_id,
             regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')
             order by position) as rn,
           count(*) over (partition by event_id,
             regexp_replace(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '^-+|-+$', '', 'g')) as cnt
    from song_club_groups
  ) t
) sub
where g.id = sub.id and g.slug is null;

-- Every existing row now has a slug; new inserts must provide one.
alter table song_club_groups alter column slug set not null;
create unique index if not exists song_club_groups_event_slug_idx
  on song_club_groups (event_id, slug);
