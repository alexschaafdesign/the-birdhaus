-- Booking: the per-date hold ladder becomes a plain "asked" list — which bands
-- were contacted about a night, each with an outcome: asked → hold → booked,
-- or passed. Same table (date_holds); position stays but goes unused.
--
-- The old statuses stay valid in the check so the currently-live code keeps
-- working until this deploy lands; existing rows map onto the new ones.

alter table date_holds drop constraint if exists date_holds_status_check;
alter table date_holds add constraint date_holds_status_check
  check (status in ('asked', 'hold', 'booked', 'passed', 'pending', 'confirmed', 'released'));
alter table date_holds alter column status set default 'asked';

update date_holds set status = case status
    when 'pending' then 'hold'
    when 'confirmed' then 'booked'
    when 'released' then 'passed'
  end
where status in ('pending', 'confirmed', 'released');

-- One live entry per band per night. A re-hold after a confirm could leave a
-- band both booked and on hold for the same date; keep the strongest row and
-- mark the rest passed so the unique index below can build.
update date_holds d
set status = 'passed', updated_at = now()
from (
  select id, row_number() over (
    partition by prospect_id, date
    order by case status when 'booked' then 0 when 'hold' then 1 else 2 end, updated_at desc
  ) as rn
  from date_holds
  where status in ('asked', 'hold', 'booked')
) ranked
where d.id = ranked.id and ranked.rn > 1;

drop index if exists date_holds_prospect_date_pending_uniq;
create unique index if not exists date_holds_prospect_date_live_uniq
  on date_holds (prospect_id, date) where status in ('asked', 'hold', 'booked');
