// Client-safe Yellow Ostrich workspace constants — no server-only imports,
// same reasoning as club-roles.ts: the filter/editor client components need
// the status list without pulling the data layer into the browser bundle.

// Album-triage pipeline, in pipeline order (used for the "by status" sort).
export const BAND_SONG_STATUSES = ['idea', 'demo', 'in_progress', 'contender', 'cut'] as const;

export type BandSongStatus = (typeof BAND_SONG_STATUSES)[number];

export const BAND_SONG_STATUS_LABEL: Record<BandSongStatus, string> = {
  idea: 'Idea',
  demo: 'Demo',
  in_progress: 'In progress',
  contender: 'Contender',
  cut: 'Cut',
};

// How finished a song's words are — independent of the song's status.
export const LYRIC_STAGES = ['none', 'sketch', 'draft', 'done'] as const;

export type LyricStage = (typeof LYRIC_STAGES)[number];

export const LYRIC_STAGE_LABEL: Record<LyricStage, string> = {
  none: 'No words',
  sketch: 'Sketch',
  draft: 'Draft',
  done: 'Done',
};
