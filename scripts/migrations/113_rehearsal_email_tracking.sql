-- Rehearsal: record when the emails about a booking went out, so admin can
-- show "not sent" (a Resend failure, or staging) and offer a resend. Additive.
--
-- admin_emailed_at: Alex was sent the new-request email (with Approve/Decline links).
-- band_emailed_at:  the band was sent the decision (confirmation or decline).

alter table rehearsal_bookings add column if not exists admin_emailed_at timestamptz;
alter table rehearsal_bookings add column if not exists band_emailed_at timestamptz;
