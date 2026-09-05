-- Per-band set times for a show, used by the in-venue CRT display (/tv) to
-- drive a live "now playing / changeover / up next" state machine off the
-- venue clock. Both columns are wall-clock "HH:MM" (24h) text in venue-local
-- time (America/Chicago), matching the existing free-text doors_time/show_time
-- on `shows` — the display owns the after-midnight (< 04:00 belongs to the
-- next calendar day) rollover, so these stay plain times, not timestamps.
--
-- Both are nullable and OPTIONAL by design: most nights no set times are
-- entered, and the TV falls back to its upcoming-shows rotation. Partial data
-- (some bands timed, others not) is expected too — the display degrades band
-- by band rather than erroring. Additive + nullable, so safe to ship ahead of
-- any writing UI (there is none yet; test data is entered by hand via SQL).
--
-- set_end is stored explicitly, NOT inferred from the next band's set_start:
-- the gap between one set's end and the next's start IS the changeover, a
-- first-class state on screen, so collapsing it into the previous set would
-- make "runs until" wrong by the length of the changeover.

alter table show_bands add column if not exists set_start text;
alter table show_bands add column if not exists set_end text;
