-- Optional auto-expiry for a TV program's manual override, so a "force this
-- mode now" doesn't get left on forever. When set and in the past, the override
-- is treated as cleared (the feed ignores it). Additive only.
alter table tv_program add column if not exists override_expires_at timestamptz;
