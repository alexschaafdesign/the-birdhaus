-- Per-date outreach log: a band can be contacted about several different
-- dates independently, each with its own outcome, distinct from the
-- submission's overall pipeline status.
create table if not exists submission_date_offers (
  id bigserial primary key,
  submission_id bigint not null references submissions(id) on delete cascade,
  date date not null,
  status text not null default 'contacted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_date_offers_status_check
    check (status in ('contacted', 'confirmed', 'declined')),
  constraint submission_date_offers_unique unique (submission_id, date)
);

create index if not exists submission_date_offers_submission_idx on submission_date_offers (submission_id);
create index if not exists submission_date_offers_date_idx on submission_date_offers (date);
