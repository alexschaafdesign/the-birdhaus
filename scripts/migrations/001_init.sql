create table if not exists submissions (
  id bigserial primary key,
  band_name text not null,
  contact_name text,
  email text,
  socials text,
  genre text,
  availability_text text,
  available_from text,
  available_to text,
  comments text,
  notes text,
  status text not null default 'new',
  source text not null default 'form',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_status_check
    check (status in ('new', 'contacted', 'replied', 'set_aside', 'booked', 'passed')),
  constraint submissions_source_check
    check (source in ('form', 'manual', 'import'))
);

create index if not exists submissions_status_idx on submissions (status);
create index if not exists submissions_created_at_idx on submissions (created_at desc);
