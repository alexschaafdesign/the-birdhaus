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

// Song colors — the one status system (migration 102). A fixed palette;
// each workspace names the colors it uses (workspaces.color_labels).
export const SONG_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const;

export type SongColor = (typeof SONG_COLORS)[number];

export type ColorLabels = Partial<Record<SongColor, string>>;

// Tuned for the dark workspace background.
export const SONG_COLOR_HEX: Record<SongColor, string> = {
  red: '#E5736B',
  orange: '#EE9B4F',
  yellow: '#E5CC5A',
  green: '#7FC27A',
  blue: '#6FA8E0',
  purple: '#B48AD9',
};

export function colorName(color: SongColor, labels: ColorLabels): string {
  return labels[color]?.trim() || color[0].toUpperCase() + color.slice(1);
}
