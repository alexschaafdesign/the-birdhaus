-- Rehearsal: ~15-minute cache of busy times from the private .ics feeds
-- (lib/rehearsal/busy.ts). Keyed by a SHA-256 of the feed URL, so the secret
-- URL itself only ever lives in rehearsal_settings. Holds start/end pairs only
-- (never titles) for the span it was fetched for, plus a short error label
-- when the last fetch failed. Additive, new table only.

create table if not exists rehearsal_busy_cache (
  feed_hash text primary key check (feed_hash ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz not null,
  ok boolean not null,
  -- [["2026-11-20T18:00:00.000Z","2026-11-20T19:00:00.000Z"], …]
  intervals jsonb not null default '[]'::jsonb,
  covers_from timestamptz not null,
  covers_to timestamptz not null,
  error text not null default '' check (char_length(error) <= 100)
);
