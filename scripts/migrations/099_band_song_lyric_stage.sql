-- Lyric stage: how finished a song's WORDS are, separate from the song's
-- pipeline status (a contender can still have sketch lyrics). Drives the
-- lyrics desk's rail. Additive; the live code never reads it.
-- Numbered 099 (not 093) so it can't collide with 093–098 on future-2027.

alter table band_songs
  add column if not exists lyric_stage text not null default 'none'
    check (lyric_stage in ('none', 'sketch', 'draft', 'done'));

-- Songs that already have words start as sketches.
update band_songs s set lyric_stage = 'sketch'
where s.lyric_stage = 'none'
  and exists (
    select 1 from band_song_lyrics_revisions r
    where r.song_id = s.id and btrim(r.body) <> ''
  );
