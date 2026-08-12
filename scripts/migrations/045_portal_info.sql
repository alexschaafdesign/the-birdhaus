-- Editable "portal info" body — the mostly-static venue/logistics rundown that
-- used to live in the long advance email and now shows on the band /hub portal
-- (the email is just a short pointer to the portal). Singleton row, seeded lazily
-- in code from DEFAULT_PORTAL_INFO (lib/portal-content.ts) the first time it's
-- read, so the seed text stays single-sourced in the constant. Edited in the
-- admin Settings screen; rendered as Markdown prose on the portal.
--
-- Per-show specifics are NOT here — schedule, pay, RSVP count, and input needs
-- each have their own portal card, driven by the show record.
create table if not exists portal_info (
  id bigserial primary key,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default row (mirrors advance_templates_one_default in 030).
create unique index if not exists portal_info_one_default
  on portal_info (is_default) where is_default;
