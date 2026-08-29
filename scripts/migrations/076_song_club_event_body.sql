-- Longer page-only body text for a Song Club event: a paragraph or two of main
-- copy shown on the public event page, distinct from the short "description /
-- theme" (which is also included in the RSVP confirmation email).
alter table song_club_events
  add column if not exists body text;
