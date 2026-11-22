-- Show request form: solo and/or full band, and who'd be on the bill when the
-- band could put one together. Additive: `formats` defaults to an empty array
-- (older and admin-entered submissions), `bill_lineup` is nullable.
alter table submissions add column if not exists formats text[] not null default '{}';
alter table submissions drop constraint if exists submissions_formats_check;
alter table submissions add constraint submissions_formats_check
  check (formats <@ array['solo', 'full_band']::text[]);
alter table submissions add column if not exists bill_lineup text;
alter table submissions drop constraint if exists submissions_bill_lineup_size;
alter table submissions add constraint submissions_bill_lineup_size
  check (bill_lineup is null or char_length(bill_lineup) <= 2000);
