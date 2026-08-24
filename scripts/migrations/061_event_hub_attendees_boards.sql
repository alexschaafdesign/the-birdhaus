-- Event becomes the portal's organizing unit: each event gets an attendee
-- roster (admin-curated), its own message board, and profile "links" show on
-- attendee cards.

-- Who came to an event (admin curates). Cards pull the user's profile.
create table if not exists song_club_event_attendees (
  event_id bigint not null references song_club_events(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- Scope board posts to an event. NULL = the general Song Club board; a value =
-- that event's board. Both threads coexist.
alter table song_club_posts
  add column if not exists event_id bigint references song_club_events(id) on delete cascade;
create index if not exists song_club_posts_event_idx on song_club_posts (event_id, created_at);

-- Profile links (Bandcamp, Instagram, website…): a jsonb array of {label,url}.
alter table users add column if not exists links jsonb not null default '[]'::jsonb;
