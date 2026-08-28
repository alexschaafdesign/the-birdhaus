-- One RSVP per email per show. The public RSVP form used to plain-insert on
-- every submit, so a person hitting it repeatedly piled up duplicate rows (and
-- the admin list then showed their ticket purchase on every duplicate, looking
-- like they'd bought several times over). Going forward the insert upserts on
-- this index; here we clear any existing duplicates first so the index can be
-- created.
--
-- Defensive dedupe: keep the most recent row per (show_id, lower(email)),
-- delete the rest. The careful admin-state-preserving merge is done ahead of
-- this by scripts/dedupe-rsvps.mjs; this DELETE is the safety net that makes the
-- unique index creation deterministic even if a new duplicate slipped in between
-- that run and this deploy (a brand-new public RSVP carries no admin state, so
-- there is nothing to preserve).
delete from rsvps r
using (
  select id,
    row_number() over (
      partition by show_id, lower(email) order by created_at desc, id desc
    ) as rn
  from rsvps
) ranked
where r.id = ranked.id and ranked.rn > 1;

create unique index if not exists rsvps_show_lower_email_uniq
  on rsvps (show_id, lower(email));
