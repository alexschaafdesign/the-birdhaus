-- Marks bands auto-created by the Twin Scene lineup-matching write-back
-- (POST /api/public/bands) as needing a human look before being treated as a
-- real Birdhaus band. Existing rows default to false — they already exist,
-- so they're implicitly reviewed.
alter table bands add column if not exists unreviewed boolean not null default false;
