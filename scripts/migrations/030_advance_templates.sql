-- Advance email boilerplate — the reusable, mostly-static body Alex sends to
-- bands ahead of every show (venue info, accessibility, sound/backline, pay
-- structure, etc.). Per-show specifics (schedule, sound engineer, show URL,
-- lineup) are NOT stored here; they're substituted into {{placeholders}} at
-- compose time from the show record. Editable in the admin so the boilerplate
-- (e.g. the "please don't let the cat in" section) is changed once, not per send.
create table if not exists advance_templates (
  id bigserial primary key,
  name text not null default 'Default',
  subject text not null,
  body text not null,
  -- Exactly one template is the default the compose screen starts from.
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default template (mirrors the one-confirmed-per-show pattern in
-- 022_sound_engineers.sql).
create unique index if not exists advance_templates_one_default
  on advance_templates (is_default) where is_default;
