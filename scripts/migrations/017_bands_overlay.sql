-- Phase 2, step 4 — Birdhaus's bands table becomes an overlay on top of Twin
-- Scene's now-canonical directory.
--
-- Every existing column stays exactly as-is; show_bands and band_videos keep
-- referencing bands.id unchanged. This only *adds*:
--   twin_scene_band_id  the canonical id in Twin Scene (unique 1:1 link; the
--                       backfill in step 5 populates it for pre-existing rows).
--   visible             whether this band surfaces on Birdhaus. Defaults false;
--                       the flip to true is owned by the app-level show_bands
--                       insert logic, NOT this migration.
--   synced_at           when the twin_scene link was last written.
alter table bands
  add column if not exists twin_scene_band_id bigint unique,
  add column if not exists visible boolean not null default false,
  add column if not exists synced_at timestamptz;
