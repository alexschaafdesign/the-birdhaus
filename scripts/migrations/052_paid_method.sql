-- How a payout was actually made (cash or venmo), recorded when a band or crew
-- member is marked paid. Null = unpaid, or paid before this was tracked.
alter table show_bands add column if not exists paid_method text;
alter table show_bands add constraint show_bands_paid_method_check
  check (paid_method is null or paid_method in ('cash', 'venmo'));

alter table settlements add column if not exists sound_paid_method text;
alter table settlements add column if not exists photographer_paid_method text;
alter table settlements add constraint settlements_sound_paid_method_check
  check (sound_paid_method is null or sound_paid_method in ('cash', 'venmo'));
alter table settlements add constraint settlements_photographer_paid_method_check
  check (photographer_paid_method is null or photographer_paid_method in ('cash', 'venmo'));

-- Crew payment handle (Venmo username, etc.), mirroring bands.payment_method
-- (039_bands_payment_method.sql): free text, admin-only, shown on the
-- settlement sheet so it's on hand when paying out.
alter table sound_engineers add column if not exists payment_method text;
alter table photographers add column if not exists payment_method text;
