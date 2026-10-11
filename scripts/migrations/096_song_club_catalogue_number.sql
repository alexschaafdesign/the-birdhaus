-- Song-a-day edition numbers (catalogue spec Rev. C): SAD-### is a
-- Song-a-day edition's primary ID (displayed as SAD-005). SC-### is retired,
-- and the in-person songwriter meetup is not catalogued.
--
-- song_a_day marks an event as a Song-a-day edition. It's explicit rather than
-- inferred from format = 'online', so another kind of online event never gets
-- numbered by accident.
--
-- catalogue_number is the edition number, stored and never derived from order:
-- backfilling an older edition must not renumber the rest. Only Song-a-day
-- editions carry one (the check constraint); everything else stays null and
-- stays out of the archive. 001–004 are RESERVED for Song-a-day V1–V4, which
-- predate this table and have no rows (they may be added later with their
-- real dates). A new edition gets max + 1 at create time (lib/song-club.ts).
--
-- Backfill: Song-a-day V5 is SAD-005, by id, guarded on title so a re-run (or
-- an unexpected row) changes nothing. Confirmed on prod and dev 2026-10-05:
-- id 2 = SONG-A-DAY V5 (format online), id 1 = B.S.S 01 (in person, no number).
--
-- song_club_events is read with explicit column lists only, so adding columns
-- is safe under the pooler rule (CLAUDE.md).
alter table song_club_events add column if not exists song_a_day boolean not null default false;

alter table song_club_events add column if not exists catalogue_number integer
  check (catalogue_number > 0);
create unique index if not exists song_club_events_catalogue_number_idx
  on song_club_events (catalogue_number) where catalogue_number is not null;

alter table song_club_events drop constraint if exists song_club_events_catalogue_number_song_a_day;
alter table song_club_events add constraint song_club_events_catalogue_number_song_a_day
  check (catalogue_number is null or song_a_day);

update song_club_events set song_a_day = true, catalogue_number = 5
where id = 2 and title = 'SONG-A-DAY V5' and catalogue_number is null;
