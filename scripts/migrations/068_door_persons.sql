-- Door person registry + settlement payee/staffing fields, mirroring the
-- photographers (050) and sound-engineer patterns. Gives the door person the
-- same settlement treatment as sound engineers & photographers: a
-- registry-backed payee with a name, a paid flag, and a paid method. Additive
-- only.
create table if not exists door_persons (
  id bigint generated always as identity primary key,
  name text not null,
  photo text,
  bio text,
  instagram text,
  contact_email text,
  -- Payment handle (Venmo username, etc.), mirroring bands.payment_method /
  -- photographers.payment_method: free text, admin-only, shown on the
  -- settlement sheet so it's on hand when paying out.
  payment_method text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists door_persons_name_idx on door_persons (lower(name));

-- Settlement payee columns for the door person, mirroring the photographer set
-- (photographer_name / photographer_paid / photographer_paid_method). Until now
-- the door person was only a bare exp_door_person amount with no name or
-- paid-status tracking.
alter table settlements add column if not exists door_person_name text;
alter table settlements add column if not exists door_paid boolean not null default false;
alter table settlements add column if not exists door_paid_method text;
alter table settlements add constraint settlements_door_paid_method_check
  check (door_paid_method is null or door_paid_method in ('cash', 'venmo'));

-- Pre-show door-person assignment tracked on the show itself (staffing),
-- mirroring shows.sound_engineer_name (018). Pre-fills the settlement's door
-- payee when no settlement row exists yet.
alter table shows add column if not exists door_person_name text;
