-- Per-band payout override for a show. NULL means "follow the computed split"
-- (artist pool / included band count); a set value fixes what that band is paid,
-- and the difference from the computed share flows to the venue net as profit.
alter table show_bands add column if not exists payout_override numeric;
