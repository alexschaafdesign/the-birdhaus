-- Archived songs: out of the pile, groups and lyrics desk, but kept (with
-- versions, lyrics, comments) under an "Archived" view and restorable. A
-- timestamp rather than a status so archiving doesn't lose the song's place
-- in the pipeline. Additive; the live code never reads it.

alter table band_songs add column if not exists archived_at timestamptz;
