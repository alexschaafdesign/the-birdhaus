-- "Needs a sound engineer": opt-in per show. Only flagged shows land in the
-- sound-coverage crew queue (SoundCoverageWidget) and email whoever has that
-- focus area. Nights Alex runs himself stay off, so the default is false.
-- Additive: a new boolean with a constant default (no table rewrite).
alter table shows add column if not exists needs_sound_engineer boolean not null default false;

-- One-time backfill so the queue starts with today's real gaps: every
-- scheduled show from today on (Central) with no confirmed engineer. No email
-- goes out for these; emails fire only when a save turns the flag on.
update shows
set needs_sound_engineer = true
where date >= (now() at time zone 'America/Chicago')::date
  and sound_engineer_name is null
  and status = 'scheduled'
  and needs_sound_engineer = false;
