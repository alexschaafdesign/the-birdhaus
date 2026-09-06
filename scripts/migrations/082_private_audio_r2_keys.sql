-- Private-audio move (Song Club tracks, Yellow Ostrich versions, file pins):
-- r2_key names the object's copy in the PRIVATE R2 bucket; playback goes
-- through session-checked routes that 302 to short-TTL presigned GETs.
-- url keeps the legacy public-bucket URL as the fallback/rollback path until
-- the post-soak deletion (scripts/delete-migrated-public-r2.mjs) runs, and
-- becomes nullable so post-move uploads never mint a public URL at all.
-- Additive/relaxing only — currently-live code still writes url everywhere.
alter table song_club_tracks add column if not exists r2_key text;
alter table song_club_tracks alter column url drop not null;
alter table band_song_versions add column if not exists r2_key text;
alter table band_song_versions alter column url drop not null;
alter table song_club_pins add column if not exists r2_key text;
alter table song_club_pins alter column url drop not null;
