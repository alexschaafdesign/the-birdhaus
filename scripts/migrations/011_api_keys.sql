create table if not exists api_keys (
  id bigserial primary key,
  key_hash text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
