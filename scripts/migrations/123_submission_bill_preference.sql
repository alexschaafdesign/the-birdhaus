-- Show request form: whether the band is putting its own bill together or
-- wants to be added to an existing one. Additive: a nullable column (older
-- and admin-entered submissions stay null) with a check on its values.
alter table submissions add column if not exists bill_preference text;
alter table submissions drop constraint if exists submissions_bill_preference_check;
alter table submissions add constraint submissions_bill_preference_check
  check (bill_preference is null or bill_preference in ('building', 'joining', 'either'));
