-- Rehearsal: what the approval flow (Phase 4) needs to know about a request,
-- recorded when the band sends it. Additive.
--
-- request_key: the blocks a band sent together share one key, so they arrive
--   as one request email (each date can still be approved or declined).
-- calendar_unchecked: a calendar feed couldn't be read when the request was
--   made, so its busy times weren't removed; the approval email flags it.
-- cancelled_by: who cancelled (the band from its page, or admin).

alter table rehearsal_bookings add column if not exists request_key text;
alter table rehearsal_bookings add column if not exists calendar_unchecked boolean not null default false;
alter table rehearsal_bookings add column if not exists cancelled_by text;

alter table rehearsal_bookings drop constraint if exists rehearsal_bookings_request_key_format;
alter table rehearsal_bookings add constraint rehearsal_bookings_request_key_format
  check (request_key is null or request_key ~ '^[A-Za-z0-9_-]{8,64}$');
alter table rehearsal_bookings drop constraint if exists rehearsal_bookings_cancelled_by_check;
alter table rehearsal_bookings add constraint rehearsal_bookings_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('band', 'admin'));

create index if not exists rehearsal_bookings_request_key_idx
  on rehearsal_bookings (request_key) where request_key is not null;
