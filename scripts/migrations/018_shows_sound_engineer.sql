-- Pre-show sound engineer assignment, tracked on the show itself (staffing)
-- separately from settlements.sound_engineer_name, which records who was
-- actually paid after the show for payout bookkeeping.
alter table shows add column if not exists sound_engineer_name text;
