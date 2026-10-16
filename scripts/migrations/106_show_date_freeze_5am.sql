-- 097's date-freeze trigger judged "past" at midnight America/Chicago; the
-- show page, the admin form and 098 use 5am the morning after (lib/shows
-- getNightDateCentral), so a show was frozen five hours before its page said
-- it was over. Same function, 5am rule. 097 itself is left as applied.
--
-- Only the function body changes; the trigger (before insert or update of
-- date, catalogue_id) still points at it, so nothing is recreated.

create or replace function shows_catalogue_id_guard() returns trigger
language plpgsql as $$
declare
  night date := ((now() at time zone 'America/Chicago') - interval '5 hours')::date;
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
    if old.announced or old.date < night then
      raise exception 'show % is announced or past: postpone it instead of changing the date', old.id
        using errcode = 'check_violation', constraint = 'shows_date_frozen';
    end if;
    new.catalogue_id := shows_free_catalogue_id(new.date, old.id);
  end if;
  return new;
end
$$;
