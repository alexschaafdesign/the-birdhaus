-- Per-band percentage of the artist pool for a show. NULL means "follow the
-- computed even split" (artist pool / included band count); a set value pays
-- that band that percentage of the pool instead — the mechanism behind an
-- uneven split like 50/25/25. Mutually exclusive with payout_override (a fixed
-- dollar amount): setting one clears the other, so a band has at most one of a
-- fixed payout, a percentage share, or the even split. When every included
-- band's percentages sum to 100 the whole pool is distributed and there are no
-- venue "savings"; a sum under 100 leaves the remainder with the venue, exactly
-- like a fixed override that shorts a band.
alter table show_bands add column if not exists payout_pct numeric;
