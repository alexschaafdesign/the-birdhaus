-- Rehearsal: flexible hourly booking + an informal rate card. Additive.
--
-- Instead of fixed standing blocks (rehearsal_hours + block_minutes, now
-- unused but kept), each weekday has one broad bookable window: an outer
-- limit only. Everything inside it is open unless a show, Not-available day,
-- blackout, busy time or another booking (plus the turnover buffer) blocks it.
-- Bands pick a start time on the step grid and one of the allowed lengths.
--
-- Rates are display-only while payments are off: estimates are computed when
-- shown, never stored as owed.

create table if not exists rehearsal_day_windows (
  weekday smallint primary key check (weekday between 0 and 6), -- 0 = Sunday
  opens time not null default '10:00',
  -- '24:00' = end of day; windows never run past midnight.
  closes time not null default '22:00',
  closed boolean not null default false,
  check (closes > opens)
);
insert into rehearsal_day_windows (weekday)
select d from generate_series(0, 6) as d
on conflict (weekday) do nothing;

alter table rehearsal_settings add column if not exists start_step_minutes int not null default 30
  check (start_step_minutes in (15, 30, 60));
alter table rehearsal_settings add column if not exists allowed_lengths int[] not null default '{60,120,180,240,360}';
alter table rehearsal_settings add column if not exists min_minutes int not null default 60
  check (min_minutes between 30 and 720);
alter table rehearsal_settings add column if not exists max_minutes int not null default 360
  check (max_minutes between 30 and 720);
alter table rehearsal_settings add column if not exists buffer_minutes int not null default 30
  check (buffer_minutes between 0 and 240);

alter table rehearsal_settings add column if not exists rate_hourly_cents int not null default 2000
  check (rate_hourly_cents between 0 and 100000);
-- [{"minutes":180,"cents":5000}, …]
alter table rehearsal_settings add column if not exists rate_packages jsonb not null
  default '[{"minutes":180,"cents":5000},{"minutes":360,"cents":10000}]';
alter table rehearsal_settings add column if not exists rate_regular_text text not null
  default 'A weekly slot is 4 sessions for the price of 3 — a 3-hour weekly slot is $150 a month.'
  check (char_length(rate_regular_text) <= 500);
alter table rehearsal_settings add column if not exists rate_flexible_text text not null
  default 'These are starting points, not rules. If money''s tight, tell me and we''ll work something out. Nobody gets turned away over money.'
  check (char_length(rate_flexible_text) <= 1000);
alter table rehearsal_settings add column if not exists estimates_enabled boolean not null default true;

-- Show days now block from 16:00 by default, so daytime stays bookable.
-- Only switch the row if it still holds the untouched old defaults.
alter table rehearsal_settings alter column show_day_rule set default 'from_time';
alter table rehearsal_settings alter column show_day_from set default '16:00';
update rehearsal_settings
set show_day_rule = 'from_time', show_day_from = '16:00'
where show_day_rule = 'whole_day' and show_day_from = '15:00';
