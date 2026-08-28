-- Per-RSVP manual attendance credit. NULL (the default) = count this person at
-- however many tickets they actually bought. When set, the admin has decided
-- this person should count as this many heads toward capacity regardless of what
-- they paid for — the "RSVP'd for 2, only bought 1 ticket, but they're both
-- coming and that's fine" case. Effective attendance for the sold-out cap
-- (migration 073) = completed online tickets + the sum, over credited RSVPs, of
-- max(0, credited_tickets - tickets that RSVP actually bought).
alter table rsvps add column if not exists credited_tickets int;
