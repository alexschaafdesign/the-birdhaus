-- Tracks whether the show has been advanced (logistics confirmed with the
-- bands, typically via email) ahead of the date. Simple boolean for now;
-- may grow into a real advancing workflow in the admin portal later.
alter table shows add column if not exists advance_sent boolean not null default false;
