-- Outbound booking pipeline for planning future seasons (2027+), separate
-- from the inbound submissions desk. booking_prospects are bands we're
-- pursuing (optionally linked to the local bands overlay); date_holds is the
-- ranked hold ladder per night (H1/H2/...) — a hold "confirms" into a real
-- shows row; date_notes are free-text stickies on calendar days ("festival
-- weekend", "avoid — competitor show").

create table if not exists booking_prospects (
  id bigint generated always as identity primary key,
  -- Optional link into the local overlay directory; set null on delete so a
  -- bands re-sync removing a row can't take the prospect with it.
  band_id bigint references bands(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'idea'
    check (status in ('idea', 'contacted', 'in_talks', 'hold', 'booked', 'passed')),
  priority integer not null default 0,
  last_contacted_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_prospects_status_idx on booking_prospects (status);

create table if not exists date_holds (
  id bigint generated always as identity primary key,
  date date not null,
  prospect_id bigint not null references booking_prospects(id) on delete cascade,
  -- Ladder rank among that date's pending holds; advisory (no unique) — every
  -- mutation resequences pending holds to 1..N inside a transaction.
  position integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'released')),
  note text,
  show_id bigint references shows(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists date_holds_date_idx on date_holds (date, position);
create index if not exists date_holds_prospect_idx on date_holds (prospect_id);
-- One live hold per prospect per night; released/confirmed history rows don't
-- block re-holding the same date later.
create unique index if not exists date_holds_prospect_date_pending_uniq
  on date_holds (prospect_id, date) where status = 'pending';

create table if not exists date_notes (
  id bigint generated always as identity primary key,
  date date not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists date_notes_date_idx on date_notes (date);
