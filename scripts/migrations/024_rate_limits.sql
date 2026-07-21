-- Lightweight fixed-window rate limiting for the unauthenticated public
-- endpoints (admin login, RSVP, show requests). One row per accepted request;
-- lib/rate-limit.ts counts recent rows per key inside a sliding window and
-- prunes rows older than the window so the table stays small.
create table if not exists rate_limit_hits (
  id bigserial primary key,
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_key_created_idx
  on rate_limit_hits (key, created_at);
