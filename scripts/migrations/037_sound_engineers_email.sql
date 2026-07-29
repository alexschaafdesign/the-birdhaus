-- A contact email for a sound engineer, so the show's confirmed engineer can be
-- looped onto the band advance (as a recipient from the start) and have band
-- replies forwarded to them. Lives on the engineer (not per-show) so it's set
-- once and reused across their shows, mirroring bands.contact_email.
alter table sound_engineers
  add column if not exists contact_email text;
