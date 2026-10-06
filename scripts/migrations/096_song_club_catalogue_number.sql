-- Stored SC-### numbers for Song Club events (displayed as SC-005). Stored,
-- never derived from order: backfilling an older event must not renumber the
-- rest.
--
-- SC-### counts every Song Club event ever, chronologically. 001–004 are
-- RESERVED for Song-a-day V1–V4, which predate this table and have no rows
-- (they may be added later with their real dates). New events get
-- max(number, 4) + 1 at create time (lib/song-club.ts).
--
-- Backfill: the two existing events, by id, guarded on title and on the
-- number still being unset so a re-run (or an unexpected row) changes nothing.
-- Confirmed on prod and dev 2026-10-05: id 1 = B.S.S 01, id 2 = SONG-A-DAY V5.
alter table song_club_events add column if not exists catalogue_number integer
  check (catalogue_number > 0);
create unique index if not exists song_club_events_catalogue_number_idx
  on song_club_events (catalogue_number) where catalogue_number is not null;

update song_club_events set catalogue_number = 5
where id = 1 and title = 'B.S.S 01 (Birdhaus Songwriter Summit)' and catalogue_number is null;

update song_club_events set catalogue_number = 6
where id = 2 and title = 'SONG-A-DAY V5' and catalogue_number is null;
