-- Marks a band as local vs. touring, with an optional hometown for touring
-- bands. hometown is only meaningful when is_touring is true — enforced by
-- the admin UI/API (dropped to null whenever is_touring is false), not a
-- DB constraint.
alter table bands
  add column if not exists is_touring boolean not null default false,
  add column if not exists hometown text;
