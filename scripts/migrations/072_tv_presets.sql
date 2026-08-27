-- Saved TV presets: named, reusable bundles of content for one mode, that can
-- be applied into any scope (global or a show). Snapshot model — applying copies
-- the preset's content in; editing the scope afterward doesn't touch the preset,
-- and editing the preset doesn't touch places it was already applied. Additive.
--
-- `data` is category-shaped JSON:
--   screensaver -> { "images": [ { "url", "caption" }, ... ] }
--   board       -> { "title": string|null, "rows": [ { "time", "label" }, ... ] }
--   cards       -> { "cards": [ { "headline", "subtext", "image", "active" }, ... ] }
create table if not exists tv_presets (
  id bigint generated always as identity primary key,
  category text not null check (category in ('screensaver', 'board', 'cards')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One preset per name within a category (case-insensitive); saving with an
-- existing name overwrites it.
create unique index if not exists tv_presets_name_idx on tv_presets (category, lower(name));
