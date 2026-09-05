-- Accounts grow up: song_club_members becomes the site-wide `users` table
-- (Song Club members, crew, admin assistants — one login system), with
-- profile fields, per-category email notification prefs, and a roles table.
--
-- Rename is safe (not additive-only) because none of the portal tables
-- (055-057) have ever shipped to prod — prod runs this whole chain in one
-- deploy, and no live code references the old name.

alter table song_club_members rename to users;

alter table users add column if not exists avatar_url text;
alter table users add column if not exists bio text;
alter table users add column if not exists notify_track_comments boolean not null default true;
alter table users add column if not exists notify_announcements boolean not null default true;
alter table users add column if not exists notify_events boolean not null default true;

-- What each login can reach: song_club = the /club portal; crew = future
-- sound-engineer/photographer pages; staff = the full admin dashboard.
create table if not exists user_roles (
  user_id bigint not null references users(id) on delete cascade,
  role text not null check (role in ('song_club', 'crew', 'staff')),
  primary key (user_id, role)
);

-- Everyone who exists today was invited as a Song Club member.
insert into user_roles (user_id, role)
select id, 'song_club' from users
on conflict do nothing;

-- Optional link from the existing crew profile tables to a login, so a crew
-- account connects to the profile the admin already manages.
alter table sound_engineers add column if not exists user_id bigint references users(id) on delete set null;
alter table photographers add column if not exists user_id bigint references users(id) on delete set null;
