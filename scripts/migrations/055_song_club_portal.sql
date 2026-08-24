-- Song Club portal: invited members with real logins, a shared message board,
-- and pinned files/embeds (Samply players etc.). Members are Birdhaus-local
-- accounts — deliberately NOT tied to Twin Scene's user system.

create table if not exists song_club_members (
  id bigserial primary key,
  email text not null unique,           -- stored lowercased
  name text not null,
  password_hash text,                   -- scrypt (lib/club-auth.ts); null until the invite is accepted
  status text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  -- Single-use set-password token (invite or password reset). Stored as a
  -- SHA-256 hex hash so a DB leak doesn't hand out live login links.
  setup_token_hash text,
  setup_token_expires_at timestamptz,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- The group-chat thread. member_id null + from_admin = a Birdhaus (Alex) post.
create table if not exists song_club_posts (
  id bigserial primary key,
  member_id bigint references song_club_members(id) on delete cascade,
  from_admin boolean not null default false,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists song_club_posts_created_idx on song_club_posts (created_at);

-- Pinned items shown above the thread: uploaded files (R2), embeds (Samply /
-- Bandcamp / etc., rendered as iframes when the host is allowlisted), or plain
-- links. Keep the pin if its member is deleted — the file may still matter.
create table if not exists song_club_pins (
  id bigserial primary key,
  member_id bigint references song_club_members(id) on delete set null,
  from_admin boolean not null default false,
  kind text not null check (kind in ('file', 'embed', 'link')),
  title text not null,
  url text not null,
  content_type text,
  size_bytes integer,
  created_at timestamptz not null default now()
);
