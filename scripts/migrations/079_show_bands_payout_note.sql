-- Free-text note explaining a manual dollar adjustment to a band's payout for a
-- show. Pairs with payout_override: the percentage (payout_pct) sets what a band
-- is *due* from the pool, and the override records what they were actually paid
-- when it differs — e.g. "band said pay them $50 and keep the rest". NULL when
-- there's no note. Unlike the earlier pct/override pairing, payout_pct and
-- payout_override now COEXIST (pct drives the due amount; override adjusts the
-- paid amount), so the note documents that adjustment.
alter table show_bands add column if not exists payout_note text;
