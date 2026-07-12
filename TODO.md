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
