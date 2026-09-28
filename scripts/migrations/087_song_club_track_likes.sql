-- A simple heart on an uploaded track — one per person per track (unlike the
-- Slack-style emoji reactions on posts/comments, there's no emoji choice
-- here). Admin ("the Birdhaus") hearts have member_id null, hence the partial
-- second index for their uniqueness.
create table if not exists song_club_track_likes (
  id bigserial primary key,
  track_id bigint not null references song_club_tracks(id) on delete cascade,
  member_id bigint references users(id) on delete cascade,
  from_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists song_club_track_likes_member_uniq
  on song_club_track_likes (track_id, member_id) where member_id is not null;
create unique index if not exists song_club_track_likes_admin_uniq
  on song_club_track_likes (track_id) where member_id is null;
create index if not exists song_club_track_likes_track_idx
  on song_club_track_likes (track_id);
