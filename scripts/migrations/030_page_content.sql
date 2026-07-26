-- Editable copy for standalone content pages (e.g. Fresh Cuts), keyed by page.
-- Each row holds a JSON blob of that page's named text blocks; the app merges it
-- over hardcoded defaults, so an absent row (or missing field) falls back to code.
create table if not exists page_content (
  key text primary key,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
