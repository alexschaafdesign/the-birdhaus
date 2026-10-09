-- Song colors replace the two overlapping status systems (band_songs.status
-- idea→cut and band_songs.lyric_stage none→done) with one color per song
-- from a fixed palette; each workspace can name its colors. The old columns
-- stay (unused by new code) so this is additive and the live code keeps
-- working until the deploy lands.

alter table band_songs
  add column if not exists color text
    check (color in ('red', 'orange', 'yellow', 'green', 'blue', 'purple'));

alter table workspaces
  add column if not exists color_labels jsonb not null default '{}'::jsonb;

-- Carry over the statuses that meant something. idea and demo stay
-- uncolored: bulk import stamped nearly every song 'demo', so mapping it
-- would paint the whole pile one color.
update band_songs set color = case status
    when 'in_progress' then 'yellow'
    when 'contender' then 'green'
    when 'cut' then 'red'
  end
where color is null and status in ('in_progress', 'contender', 'cut');

update workspaces
set color_labels =
  '{"yellow": "In progress", "green": "Contender", "red": "Cut"}'::jsonb
where color_labels = '{}'::jsonb;
