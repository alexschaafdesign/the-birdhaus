-- Ad-hoc recipients on a show's advance: email addresses that aren't tied to a
-- band (contact_email) or the confirmed sound engineer — e.g. a promoter, a
-- venue manager, a tour manager. Stored as a jsonb array of plain email strings
-- on the show_advances row so they ride along with the same draft save/send and
-- reply-thread paths as the rest of the recipient list.
alter table show_advances
  add column if not exists extra_emails jsonb not null default '[]'::jsonb;
