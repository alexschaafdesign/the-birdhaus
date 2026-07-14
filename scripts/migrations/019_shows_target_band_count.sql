-- Lets an operator mark a show as an intentional 2-band (or 4-band, etc.) bill,
-- so the "needs more bands" admin flag compares against the show's own intended
-- lineup size instead of a single hardcoded assumption.
alter table shows add column if not exists target_band_count integer not null default 3;
