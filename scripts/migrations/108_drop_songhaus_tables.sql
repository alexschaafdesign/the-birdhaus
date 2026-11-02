-- Phase 5, Deploy C: drop the 22 song-a-day / workspace tables that moved to
-- Songhaus's own database at the Phase 4 split (2026-10-11). Birdhaus hasn't
-- read or written them since Deploy B; they were kept only as the rollback
-- copy. No other table, view or function depends on them.
--
-- Final archive, taken before this ran: a pg_dump of all 22 tables from prod
-- (birdhaus-prod-songhaus-tables-2026-11-02.dump, kept off-repo). `users` and
-- `user_roles` stay: they're Birdhaus's own accounts.
--
-- One statement, so the foreign keys between these tables don't dictate an
-- order. No CASCADE: if anything outside this list still depended on one of
-- them, this should fail rather than quietly drop it.

drop table if exists
  song_club_post_reactions,
  song_club_posts,
  song_club_pins,
  song_club_comment_reactions,
  song_club_track_likes,
  song_club_track_comments,
  song_club_playlist_tracks,
  song_club_tracks,
  song_club_rsvps,
  song_club_event_attendees,
  song_club_groups,
  song_club_events,
  song_club_playlists,
  band_song_lyrics_revisions,
  band_song_comments,
  band_song_versions,
  band_song_group_members,
  band_songs,
  band_song_groups,
  workspace_scratch_revisions,
  workspace_members,
  workspaces;
