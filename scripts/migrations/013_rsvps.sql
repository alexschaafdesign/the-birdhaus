create table if not exists rsvps (
  id bigserial primary key,
  show_id bigint not null references shows(id) on delete cascade,
  name text not null,
  email text not null,
  guests int not null default 1,
  email_list_opt_in boolean not null default false,
  confirmation_email_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_rsvps_show_id on rsvps (show_id);
create index if not exists idx_rsvps_email on rsvps (email);
