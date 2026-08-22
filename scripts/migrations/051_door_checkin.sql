-- Door check-in kiosk (/door/<token>): a live headcount for the night, run on an
-- iPad at the front that the host or guests themselves tap.
--
--  * rsvps.arrived_count — how many people from an RSVP have actually shown up.
--    A party of 3 taps their name three times. Supersedes the boolean `arrived`
--    flag for counting purposes; we keep `arrived` in sync (arrived = count > 0)
--    so the existing admin door-list UI still reflects who's here. Backfill any
--    rows already marked arrived in admin as their full party having come.
--  * shows.walkin_count — people who never RSVP'd, tallied anonymously so the
--    host still gets a true total show count.
--  * shows.door_token — unguessable per-show token, like share_token, so the
--    kiosk lives outside the admin auth gate and is safe to hand to guests.
--    Nullable + lazily generated the first time the host opens the door link.
alter table rsvps
  add column if not exists arrived_count int not null default 0;

update rsvps
  set arrived_count = greatest(guests, 1)
  where arrived is true and arrived_count = 0;

alter table shows
  add column if not exists walkin_count int not null default 0,
  add column if not exists door_token text;

create unique index if not exists shows_door_token_idx
  on shows (door_token) where door_token is not null;
