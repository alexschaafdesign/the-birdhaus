-- Persist the per-show editable fields of an advance (intro, schedule,
-- soundcheck notes, sound-engineer override) as a jsonb blob, so a composed-
-- but-not-yet-sent draft survives navigating away and can be re-edited or
-- resent. The rendered subject/body are still stored in their own columns
-- (what actually gets sent); this is the structured source they're rendered
-- from. jsonb (not columns) so the field set can evolve without a migration.
alter table show_advances
  add column if not exists vars jsonb not null default '{}'::jsonb;
