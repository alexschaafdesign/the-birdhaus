## Part C: Drop legacy JSONB columns (bands + videos)

**Status:** Waiting — do not execute before 2026-07-25
**Prereq:** Confirm no rollback or data-integrity incidents since the show_bands / show_videos / band_videos migrations shipped.

**What this covers:**
- Drop `shows.bands` JSONB column (superseded by `show_bands` join table)
- Drop `shows.videos` JSONB column (superseded by `show_videos` / `band_videos`)
- Remove the JSONB-writing code in the show create/update path (lib/bands.ts, lib/videos.ts, and the POST/PATCH show routes) — currently dual-writing to both JSONB and the join tables
- Write and run the drop migration
- Confirm nothing still reads shows.bands/videos JSONB directly before dropping (grep for it)

**Why waiting matters:** the JSONB columns are the fallback if the join-table read path has an edge case we haven't hit yet. Don't collapse this early just because it feels done.

## Drop Twin Scene overlay columns from `bands`

**Status:** Open — any deploy after the 2026-11-27 bands cleanup has been live a while.

Birdhaus's bands table stopped mirroring Twin Scene on 2026-11-27 (writes, nightly sync and the deprecated `/api/public/bands` endpoint removed; never-played bands pruned with `scripts/prune-unplayed-bands.mjs`). These are now unused and can be dropped in their own migration, after the code that stopped reading them is live:
- `bands.twin_scene_band_id`, `bands.synced_at`, `bands.visible`, `bands.unreviewed`
- the never-displayed mirror fields: `genres`, `city`, `neighborhoods`, `members`, `contact_method`, `website`, `bandcamp`, `bandcamp_embed_url`, `bandcamp_embed_height`, `featured_links` (check nothing reads them first; `importBandFromTwinScene` in `lib/bands.ts` still writes them)
- the `api_keys` table (only the deleted public endpoint used it)
Keep `twinscene_slug` (Twin Scene page and stage-plot links).

## Move audio/photos JSONB to join tables

**Status:** Open — after Part C's pattern (bands/videos) has settled.
**Why:** per-set audio and photos currently ride as an optional `bandId` key on `shows.audio` / `shows.photos` JSONB entries (migration 093). Proper `show_audio` / `show_photos` join tables would match `show_bands` / `show_videos` / `band_videos`.
**Mind CLAUDE.md:** every query names its columns (the build checks). Dropping `shows.audio` / `shows.photos` afterwards means taking them out of `SHOW_COLUMNS` a deploy before the column drop (see docs/db-safety.md).

## Admin: per-set audio picker (+ untitled-audio save fix)

**Status:** Deferred — pick up when sets start going out on Bandcamp. The Audio section is unused today.
**What this covers:**
- A band picker on each Audio row in ShowForm (optional; empty = whole night), tagged by lineup position like video rows (`bandIndexes` → server resolves to `bandId`), so a band added in the same save can be tagged. The data side already works: `shows.audio` entries keep an optional `bandId` (093) and `lib/archive/live.ts` reads it.
- Fix: ShowForm drops any audio row without a title on save (`form.audio.filter((a) => a.bandcamp.trim() && a.title.trim())`) — the same silent-drop bug videos had. Keep any row with a Bandcamp URL; title optional.
