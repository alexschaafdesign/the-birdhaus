-- Structured photographer assignment for shows: which registry photographer is
-- booked to shoot a given show. Drives the crew photographer's Queue (upcoming
-- shoots + past shows still needing photos) and defaults the per-photo upload
-- credit. Distinct from the legacy free-text `photographer` jsonb (a name/IG
-- label) and from per-photo `photos[].photographerId` credits.
--
-- Additive and nullable, so it's backward-compatible with the currently-live
-- code (which doesn't read it yet). on delete set null so removing a
-- photographer from the registry just unassigns their shows.
alter table shows
  add column if not exists photographer_id bigint references photographers(id) on delete set null;

create index if not exists shows_photographer_id_idx on shows (photographer_id);
