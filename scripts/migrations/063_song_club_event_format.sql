-- Song Club events come in two formats: in-person meetups (public RSVP + "I
-- participated") and online Song-a-day rounds (no RSVP; members "Sign me up" to
-- enroll). Existing events default to in_person.
alter table song_club_events
  add column if not exists format text not null default 'in_person'
  check (format in ('in_person', 'online'));
