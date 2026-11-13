-- Booking: mark a day "Not available" (a known conflict, out of town). Lives
-- on booking_days next to the title/notepad, so the title doubles as the
-- reason ("Out of town"). Additive; the live code ignores the column.

alter table booking_days
  add column if not exists unavailable boolean not null default false;
