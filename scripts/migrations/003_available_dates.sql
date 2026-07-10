-- Dates the venue operator knows are open, so the admin board can filter
-- submissions down to "who's available on this specific date."
create table if not exists available_dates (
  id bigserial primary key,
  date date not null unique,
  created_at timestamptz not null default now()
);

create index if not exists available_dates_date_idx on available_dates (date);
