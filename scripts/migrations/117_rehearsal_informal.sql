-- Rehearsal: the informal direction. Payments become optional (off by
-- default: Alex handles sliding-scale rates by hand, so no prices, totals,
-- Venmo or paid/outstanding anywhere while off; the code stays). An editable
-- facts line replaces the price facts on /rehearsal. The day-before reminder
-- and the lapsed-request email can be switched off. Each band gets private
-- "rate & payment notes". Additive.

alter table rehearsal_settings add column if not exists payments_enabled boolean not null default false;
alter table rehearsal_settings add column if not exists public_facts_line text not null
  default '3-hour blocks · sliding scale — pay what you can, we''ll figure it out'
  check (char_length(public_facts_line) <= 300);
alter table rehearsal_settings add column if not exists reminder_emails_enabled boolean not null default true;
alter table rehearsal_settings add column if not exists lapsed_emails_enabled boolean not null default true;

alter table rehearsal_bands add column if not exists rate_notes text not null default ''
  check (char_length(rate_notes) <= 2000);
