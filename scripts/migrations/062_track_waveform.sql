-- Precomputed waveform peaks + duration for the rich player. Peaks are
-- computed in the browser at upload time (a downsampled amplitude array), so
-- the player draws the waveform without re-downloading/decoding the audio.
alter table song_club_tracks add column if not exists peaks jsonb;
alter table song_club_tracks add column if not exists duration_seconds real;
