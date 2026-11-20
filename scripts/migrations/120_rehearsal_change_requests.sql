-- Bands can ask to change a booking from their booking page. The new time is
-- a pending row that points at the booking it replaces; the original stays
-- confirmed (and holds its time) until Alex approves, when one transaction
-- confirms the new row and cancels the original (lib/rehearsal/decisions.ts).
--
-- replaces_booking_id: the booking this one would replace (display + swap).
-- slot_id: the "same session" key for the no-overlap backstop. A change may
-- overlap the booking it replaces (1–2pm -> 1–3pm), so the exclusion
-- constraint only forbids overlap between rows with different
-- coalesce(slot_id, id). A change takes its original's key, so a change of an
-- approved change still shares the first booking's key.
--
-- Backward compatible: live code never sets either column, so every row keeps
-- key = id and the constraint behaves exactly as before for it.
alter table rehearsal_bookings
  add column if not exists replaces_booking_id bigint references rehearsal_bookings (id) on delete restrict;
alter table rehearsal_bookings
  add column if not exists slot_id bigint references rehearsal_bookings (id) on delete restrict;
create index if not exists rehearsal_bookings_replaces_idx
  on rehearsal_bookings (replaces_booking_id) where replaces_booking_id is not null;

-- `<>` on a bigint inside a gist exclusion needs btree_gist.
create extension if not exists btree_gist;

alter table rehearsal_bookings drop constraint if exists rehearsal_bookings_no_overlap;
alter table rehearsal_bookings add constraint rehearsal_bookings_no_overlap
  exclude using gist ((coalesce(slot_id, id)) with <>, tstzrange(starts_at, ends_at) with &&)
  where (status in ('pending', 'confirmed'));
