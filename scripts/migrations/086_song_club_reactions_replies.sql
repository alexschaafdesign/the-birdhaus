-- Facebook-style interactions for Song Club threads:
--   * Replies: a post may answer another post (one level deep — the app
--     refuses reply-to-reply). Replies live in song_club_posts itself via
--     parent_post_id and inherit the parent's board scope; deleting a post
--     takes its replies with it.
--   * Reactions: Slack-style — a person may add any number of DISTINCT emoji
--     to a post or track comment; the same emoji twice is a no-op (the app
--     toggles it off instead). Admin ("the Birdhaus") reactions have
--     member_id null, so uniqueness needs the partial second index.

alter table song_club_posts
  add column if not exists parent_post_id bigint references song_club_posts(id) on delete cascade;
create index if not exists song_club_posts_parent_idx on song_club_posts (parent_post_id);

create table if not exists song_club_post_reactions (
  id bigserial primary key,
  post_id bigint not null references song_club_posts(id) on delete cascade,
  member_id bigint references users(id) on delete cascade,
  from_admin boolean not null default false,
  emoji text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists song_club_post_reactions_member_uniq
  on song_club_post_reactions (post_id, member_id, emoji) where member_id is not null;
create unique index if not exists song_club_post_reactions_admin_uniq
  on song_club_post_reactions (post_id, emoji) where member_id is null;
create index if not exists song_club_post_reactions_post_idx
  on song_club_post_reactions (post_id);

create table if not exists song_club_comment_reactions (
  id bigserial primary key,
  comment_id bigint not null references song_club_track_comments(id) on delete cascade,
  member_id bigint references users(id) on delete cascade,
  from_admin boolean not null default false,
  emoji text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists song_club_comment_reactions_member_uniq
  on song_club_comment_reactions (comment_id, member_id, emoji) where member_id is not null;
create unique index if not exists song_club_comment_reactions_admin_uniq
  on song_club_comment_reactions (comment_id, emoji) where member_id is null;
create index if not exists song_club_comment_reactions_comment_idx
  on song_club_comment_reactions (comment_id);
