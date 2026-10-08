-- One URL per night: /shows/BH-YYMMDD. The catalogue id (spec Rev. C) moves
-- from derived-on-read (lib/archive/live.ts) to stored, so a flyer QR code or
-- a link shared before the show keeps resolving after it becomes an archive
-- night. Plus a status for cancelled / postponed nights.
--
-- catalogue_id: BH-YYMMDD, and BH-YYMMDDb, BH-YYMMDDc … for a second, third
-- event on one date (first by id keeps the bare id). Minted by a BEFORE INSERT
-- trigger, so every writer gets one — the admin API, scripts/import-shows.mjs,
-- and the currently-live code during the deploy window (it doesn't know the
-- column). It follows the date while the show is unannounced and still ahead;
-- once announced or past, the id is frozen and the date can't change at all:
-- moving an announced night is a postpone (a new show with its own id, see
-- status/rescheduled_to), never an edit. The trigger enforces that as a
-- backstop to the admin API and form.
--
-- status: scheduled | cancelled | postponed. rescheduled_to points a postponed
-- night at the show that replaced it.
--
-- shows is read with explicit column lists only (SHOW_COLUMNS, enforced at
-- build), so adding columns is safe under the pooler rule (CLAUDE.md). The
-- columns are additive; nothing live reads them until the 2027 show page.

alter table shows add column if not exists catalogue_id text;
alter table shows add column if not exists status text not null default 'scheduled';
alter table shows add column if not exists rescheduled_to bigint references shows (id) on delete set null;

alter table shows drop constraint if exists shows_catalogue_id_format;
alter table shows add constraint shows_catalogue_id_format
  check (catalogue_id ~ '^BH-[0-9]{6}[b-z]?$');

alter table shows drop constraint if exists shows_status_check;
alter table shows add constraint shows_status_check
  check (status in ('scheduled', 'cancelled', 'postponed'));

alter table shows drop constraint if exists shows_rescheduled_to_check;
alter table shows add constraint shows_rescheduled_to_check
  check (rescheduled_to is null or (status = 'postponed' and rescheduled_to <> id));

-- Backfill: per date, oldest id first. n = 0 keeps the bare id; n = 1 is 'b'.
with ranked as (
  select id,
         'BH-' || to_char(date, 'YYMMDD') as base,
         row_number() over (partition by date order by id) - 1 as n
  from shows
)
update shows s
set catalogue_id = r.base || case when r.n = 0 then '' else chr(97 + r.n::int) end
from ranked r
where s.id = r.id and s.catalogue_id is null;

create unique index if not exists shows_catalogue_id_idx on shows (catalogue_id);

-- The first free id for a date: the bare id, else the next unused letter.
create or replace function shows_free_catalogue_id(d date, self bigint) returns text
language plpgsql as $$
declare
  base text := 'BH-' || to_char(d, 'YYMMDD');
  candidate text := base;
  n int := 0;
begin
  while exists (
    select 1 from shows where catalogue_id = candidate and id is distinct from self
  ) loop
    n := n + 1;
    if n > 25 then
      raise exception 'no free catalogue id for %', d;
    end if;
    candidate := base || chr(97 + n);
  end loop;
  return candidate;
end
$$;

create or replace function shows_catalogue_id_guard() returns trigger
language plpgsql as $$
declare
  today date := (now() at time zone 'America/Chicago')::date;
begin
  if tg_op = 'INSERT' then
    if new.catalogue_id is null then
      new.catalogue_id := shows_free_catalogue_id(new.date, new.id);
    end if;
    return new;
  end if;

  -- UPDATE. The id is never edited by hand.
  if new.catalogue_id is distinct from old.catalogue_id then
    raise exception 'catalogue_id is minted, not edited (show %)', old.id
      using errcode = 'check_violation';
  end if;
  if new.date is distinct from old.date then
    if old.announced or old.date < today then
      raise exception 'show % is announced or past: postpone it instead of changing the date', old.id
        using errcode = 'check_violation', constraint = 'shows_date_frozen';
    end if;
    new.catalogue_id := shows_free_catalogue_id(new.date, old.id);
  end if;
  return new;
end
$$;

drop trigger if exists shows_catalogue_id_guard on shows;
create trigger shows_catalogue_id_guard
  before insert or update of date, catalogue_id on shows
  for each row execute function shows_catalogue_id_guard();

alter table shows alter column catalogue_id set not null;
