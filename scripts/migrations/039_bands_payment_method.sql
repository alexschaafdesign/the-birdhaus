-- A band's payment handle (Venmo username, etc.), for paying them out after a
-- show. Private/admin-only — deliberately NOT part of the shared Band read, the
-- public bands endpoint, or the Twin Scene push (its SELECT_COLS list is fixed),
-- so it never leaves the Birdhaus admin. Local overlay field (see
-- ../twinscene/ARCHITECTURE.md); Twin Scene sync never touches it.
alter table bands
  add column if not exists payment_method text;
