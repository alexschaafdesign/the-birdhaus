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

## Part D: Remove deprecated /api/public/bands

**Status:** Deprecated 2026-07-17 — do not remove before 2026-08-17
**Prereq:** Confirm no traffic to this route in the intervening month (check logs/analytics for GET/POST hits with a valid x-api-key).

**Why it's deprecated:** Twin Scene's scraper lineup matcher (`resolveLineupBandSlugs()`) was repointed from this endpoint to a local canonical-table query in Twin Scene's own DB, and Crawlspace's `createTwinSceneBand()` now posts through Twin Scene's own `/api/public/bands` API instead of this one. Nothing in either partner project calls this route anymore as of the repoint.

**What this covers:**
- Delete `app/api/public/bands/route.ts` (GET + POST) and `app/api/public/bands/[slug]` if present
- Revoke/delete any `api_keys` rows that existed solely for this integration
- Remove the CORS/auth plumbing (`authenticate()`, `CORS_HEADERS`) if nothing else in the app uses it
- Confirm no other consumer exists before deleting — this was a semi-public integration point, so check for anyone besides Twin Scene/Crawlspace who might have a key

## Move audio/photos JSONB to join tables

**Status:** Open — after Part C's pattern (bands/videos) has settled.
**Why:** per-set audio and photos currently ride as an optional `bandId` key on `shows.audio` / `shows.photos` JSONB entries (migration 093). Proper `show_audio` / `show_photos` join tables would match `show_bands` / `show_videos` / `band_videos`.
**Mind CLAUDE.md:** every query names its columns (the build checks). Dropping `shows.audio` / `shows.photos` afterwards means taking them out of `SHOW_COLUMNS` a deploy before the column drop (see docs/db-safety.md).

## Admin: per-set audio picker (+ untitled-audio save fix)

**Status:** Deferred — pick up when sets start going out on Bandcamp. The Audio section is unused today.
**What this covers:**
- A band picker on each Audio row in ShowForm (optional; empty = whole night), tagged by lineup position like video rows (`bandIndexes` → server resolves to `bandId`), so a band added in the same save can be tagged. The data side already works: `shows.audio` entries keep an optional `bandId` (093) and `lib/archive/live.ts` reads it.
- Fix: ShowForm drops any audio row without a title on save (`form.audio.filter((a) => a.bandcamp.trim() && a.title.trim())`) — the same silent-drop bug videos had. Keep any row with a Bandcamp URL; title optional.
