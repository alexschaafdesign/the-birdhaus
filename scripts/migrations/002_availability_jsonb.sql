-- Replace available_from/available_to (a single range) with a JSONB array that
-- can hold any mix of specific dates and ranges, e.g.:
--   [{"type":"date","value":"2026-09-05"}, {"type":"range","from":"2026-08-01","to":"2026-09-30"}]

alter table submissions add column if not exists availability jsonb not null default '[]'::jsonb;

-- Backfill: fold any existing available_from/available_to into a single entry.
update submissions
set availability = availability || jsonb_build_array(
  case
    when available_from is not null and available_to is not null and available_from = available_to
      then jsonb_build_object('type', 'date', 'value', available_from)
    when available_from is not null and available_to is not null
      then jsonb_build_object('type', 'range', 'from', available_from, 'to', available_to)
    when available_from is not null
      then jsonb_build_object('type', 'date', 'value', available_from)
    else
      jsonb_build_object('type', 'date', 'value', available_to)
  end
)
where available_from is not null or available_to is not null;

alter table submissions add constraint submissions_availability_is_array
  check (jsonb_typeof(availability) = 'array');

alter table submissions drop column available_from;
alter table submissions drop column available_to;
