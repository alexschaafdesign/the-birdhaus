-- Booking calendar subscription (Apple Calendar etc.). Calendar apps can't
-- log in, so the feed URL carries a secret token; whoever holds the URL can
-- read the booking calendar, including day notepads. "Reset link" revokes the
-- current token and issues a new one. At most one live token at a time.

create table if not exists booking_calendar_feeds (
  id bigint generated always as identity primary key,
  token text not null unique check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index if not exists booking_calendar_feeds_one_live
  on booking_calendar_feeds ((true)) where revoked_at is null;
