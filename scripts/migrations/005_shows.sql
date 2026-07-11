-- Shows, editable via the admin UI instead of hand-edited markdown files.
create table if not exists shows (
  id bigserial primary key,
  slug text not null unique,
  title text not null,
  date date not null,
  doors_time text,
  show_time text,
  flyer text,
  bands jsonb not null default '[]',         -- [{ name, instagram?, bio? }]
  description text,
  photographer jsonb,                         -- { name, instagram? } | null
  rsvp_url text,
  ticket_url text,
  external_ticket_url text,
  rsvp_form boolean not null default true,
  videos jsonb not null default '[]',        -- [{ youtube, title }]
  audio jsonb not null default '[]',         -- [{ bandcamp, title }]
  photos jsonb not null default '[]',        -- string[]
  photo_folder text,
  photo_credit text,
  content_markdown text not null default '', -- raw markdown body; rendered to HTML on read
  announced boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shows_date_idx on shows (date);
