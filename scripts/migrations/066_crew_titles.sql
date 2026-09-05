-- Crew accounts get a display title ("VP of Sound Engineering") and a set of
-- assignable "focus areas" — keys from the code registry in lib/crew.ts that
-- decide which widgets show on their tailored /admin home. Both are additive
-- and nullable/defaulted, so this is safe to ship ahead of the reading code.
--
-- A crew member is just a user carrying the existing 'crew' + 'staff' roles
-- (staff already grants full admin via lib/club-session.ts). These columns are
-- ignored for non-crew users.

alter table users add column if not exists title text;
alter table users add column if not exists focus_areas text[] not null default '{}';
