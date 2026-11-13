-- Rehearsal space booking (private, invite-only). New tables only: nothing on
-- shows, bands, settlements or submissions changes, so this is additive and
-- the pooler rule (CLAUDE.md) isn't involved.
--
-- Availability is never stored. It's computed on request (lib/rehearsal):
-- standing hours, minus show days (read from shows, unchanged), minus
-- booking_days.unavailable (read-only), minus busy times from private .ics
-- feeds, minus pending + confirmed bookings, minus blackouts, inside the
-- booking window. All wall times are America/Chicago.
--
-- Bands get no account: each has a private link (/rehearsal/book/<token>),
-- modelled on booking_calendar_feeds (105). user_id is left for later.

-- Settings: one row, seeded below. Typed columns so bad values can't land.
create table if not exists rehearsal_settings (
  id boolean primary key default true check (id),
  block_minutes int not null default 180 check (block_minutes between 30 and 720),
  price_cents int not null default 0 check (price_cents between 0 and 1000000),
  -- null = repeat bookings cost the same as one-offs.
  repeat_price_cents int check (repeat_price_cents between 0 and 1000000),
  window_min_hours int not null default 24 check (window_min_hours between 0 and 720),
  window_max_weeks int not null default 8 check (window_max_weeks between 1 and 52),
  cancel_cutoff_hours int not null default 48 check (cancel_cutoff_hours between 0 and 720),
  pending_expiry_days int not null default 3 check (pending_expiry_days between 1 and 60),
  -- whole_day: a show blocks its whole Chicago calendar day.
  -- from_time: a show blocks its day from show_day_from onward.
  show_day_rule text not null default 'whole_day' check (show_day_rule in ('whole_day', 'from_time')),
  show_day_from time not null default '15:00',
  -- Private calendar URLs (secret). Admin-only; never sent to a public page.
  ics_feed_urls text[] not null default '{}' check (cardinality(ics_feed_urls) <= 10),
  venmo_handle text not null default 'thebirdhaus' check (venmo_handle ~ '^[A-Za-z0-9_-]{1,40}$'),
  square_enabled boolean not null default false,
  cash_enabled boolean not null default false,
  cash_box_location text not null default '' check (char_length(cash_box_location) <= 200),
  -- Sent only to approved bands (PRODUCT.md: the address stays private).
  address text not null default '' check (char_length(address) <= 500),
  arrival_notes text not null default '' check (char_length(arrival_notes) <= 5000),
  cancellation_policy text not null default '' check (char_length(cancellation_policy) <= 5000),
  email_approved_intro text not null default '' check (char_length(email_approved_intro) <= 5000),
  email_declined_intro text not null default '' check (char_length(email_declined_intro) <= 5000),
  email_reminder_intro text not null default '' check (char_length(email_reminder_intro) <= 5000),
  email_lead_autoreply text not null default '' check (char_length(email_lead_autoreply) <= 5000),
  updated_at timestamptz not null default now()
);

insert into rehearsal_settings (id) values (true) on conflict (id) do nothing;

-- Standing hours: the weekly template of block start times (Chicago wall
-- time). Block length comes from settings. 0 = Sunday … 6 = Saturday.
create table if not exists rehearsal_hours (
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  created_at timestamptz not null default now(),
  primary key (weekday, start_time)
);

create table if not exists rehearsal_blackouts (
  id bigint generated always as identity primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists rehearsal_blackouts_ends_at_idx on rehearsal_blackouts (ends_at);

create table if not exists rehearsal_bands (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 200),
  contact_name text not null default '' check (char_length(contact_name) <= 200),
  email text not null check (char_length(email) between 3 and 320 and email like '%@%'),
  phone text not null default '' check (char_length(phone) <= 40),
  notes text not null default '' check (char_length(notes) <= 10000),
  user_id bigint references users (id) on delete set null,   -- future accounts
  square_customer_id text,                                    -- Phase 6b
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private booking links. Replace = revoke the live one and insert a new one,
-- so an old link stops working and the history stays.
create table if not exists rehearsal_band_links (
  id bigint generated always as identity primary key,
  band_id bigint not null references rehearsal_bands (id) on delete cascade,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists rehearsal_band_links_one_live
  on rehearsal_band_links (band_id) where revoked_at is null;

-- "I'm interested" form submissions. Invite creates the band and links it.
create table if not exists rehearsal_leads (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 200),
  project text not null default '' check (char_length(project) <= 200),
  email text not null check (char_length(email) between 3 and 320 and email like '%@%'),
  phone text not null default '' check (char_length(phone) <= 40),
  people smallint check (people between 1 and 50),
  genre_links text not null default '' check (char_length(genre_links) <= 2000),
  frequency text not null check (frequency in ('one_time', 'weekly', 'biweekly', 'now_and_then')),
  preferred_times text not null default '' check (char_length(preferred_times) <= 2000),
  notes text not null default '' check (char_length(notes) <= 5000),
  status text not null default 'new' check (status in ('new', 'invited', 'archived')),
  band_id bigint references rehearsal_bands (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rehearsal_leads_status_idx on rehearsal_leads (status, created_at);

-- A repeating request. Its occurrences are rows in rehearsal_bookings; the
-- weekday and time come from the first one. Ends on a date or after a count.
create table if not exists rehearsal_series (
  id bigint generated always as identity primary key,
  band_id bigint not null references rehearsal_bands (id) on delete restrict,
  freq text not null check (freq in ('weekly', 'biweekly', 'monthly_nth')),
  until_date date,
  occurrences smallint check (occurrences between 1 and 104),
  payment_method text not null default 'venmo' check (payment_method in ('venmo', 'square', 'cash')),
  note text not null default '' check (char_length(note) <= 2000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((until_date is null) <> (occurrences is null))
);

create table if not exists rehearsal_bookings (
  id bigint generated always as identity primary key,
  -- RH-YYMMDD, RH-YYMMDDb, … (Catalogue Naming Spec, lib/catalogue.ts),
  -- minted by the trigger below from the Chicago date of starts_at.
  catalogue_id text not null unique check (catalogue_id ~ '^RH-[0-9]{6}[b-z]?$'),
  band_id bigint not null references rehearsal_bands (id) on delete restrict,
  series_id bigint references rehearsal_series (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'cancelled', 'expired')),
  -- Set at request time from pending_expiry_days, so a later settings change
  -- doesn't move requests already waiting.
  expires_at timestamptz not null,
  -- A show / blackout / busy time landed on a confirmed booking later.
  -- Flagged for admin, never auto-cancelled. The reason is admin-only.
  conflict boolean not null default false,
  conflict_reason text not null default '' check (char_length(conflict_reason) <= 500),
  conflict_flagged_at timestamptz,
  -- Snapshotted at request time; a later price change doesn't touch it.
  price_cents int not null check (price_cents between 0 and 1000000),
  -- What the band chose…
  payment_method text not null default 'venmo' check (payment_method in ('venmo', 'square', 'cash')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'comped', 'refunded')),
  -- …and how it was actually paid (a cash "not left" may end up on Venmo).
  payment_provider text check (payment_provider in ('venmo', 'square', 'cash')),
  payment_ref text check (char_length(payment_ref) <= 200),
  paid_at timestamptz,
  addons jsonb not null default '[]'::jsonb,   -- future (recording add-on)
  note text not null default '' check (char_length(note) <= 2000),
  decline_reason text not null default '' check (char_length(decline_reason) <= 2000),
  decided_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- No two live bookings overlap: the database backstop behind the engine.
  constraint rehearsal_bookings_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at) with &&)
    where (status in ('pending', 'confirmed'))
);
create index if not exists rehearsal_bookings_band_idx on rehearsal_bookings (band_id, starts_at);
create index if not exists rehearsal_bookings_status_idx on rehearsal_bookings (status, starts_at);
create index if not exists rehearsal_bookings_series_idx on rehearsal_bookings (series_id) where series_id is not null;

-- Catalogue id minting. Same shape as shows_free_catalogue_id (097): the
-- first booking on a date gets the bare id, later ones b, c, … Ids are never
-- reused (declined/cancelled rows keep theirs). The advisory lock serialises
-- two requests minting on the same date.
create or replace function rehearsal_free_catalogue_id(d date) returns text
language plpgsql as $$
declare
  base text := 'RH-' || to_char(d, 'YYMMDD');
  candidate text := base;
  n int := 0;
begin
  perform pg_advisory_xact_lock(hashtext(base));
  while exists (select 1 from rehearsal_bookings where catalogue_id = candidate) loop
    n := n + 1;
    if n > 25 then
      raise exception 'no free rehearsal catalogue id for %', d;
    end if;
    candidate := base || chr(97 + n);
  end loop;
  return candidate;
end
$$;

create or replace function rehearsal_bookings_catalogue_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.catalogue_id is null then
      new.catalogue_id := rehearsal_free_catalogue_id((new.starts_at at time zone 'America/Chicago')::date);
    end if;
    return new;
  end if;
  if new.catalogue_id is distinct from old.catalogue_id then
    raise exception 'catalogue_id is minted, not edited (rehearsal booking %)', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists rehearsal_bookings_catalogue on rehearsal_bookings;
create trigger rehearsal_bookings_catalogue
  before insert or update of catalogue_id on rehearsal_bookings
  for each row execute function rehearsal_bookings_catalogue_guard();
