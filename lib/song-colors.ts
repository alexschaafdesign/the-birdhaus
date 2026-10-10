// Workspace color names (migration 102). Song colors themselves live on
// band_songs.color via updateSong; this is the per-workspace legend.

import { sql } from './db';
import { SONG_COLORS, type ColorLabels, type SongColor } from './band-constants';

const MAX_LABEL_LENGTH = 40;

export async function getColorLabels(workspaceId: number): Promise<ColorLabels> {
  const [row] = await sql<Array<{ color_labels: Record<string, unknown> | null }>>`
    select color_labels from workspaces where id = ${workspaceId}
  `;
  return sanitizeColorLabels(row?.color_labels ?? {});
}

export function sanitizeColorLabels(input: unknown): ColorLabels {
  const out: ColorLabels = {};
  if (!input || typeof input !== 'object') return out;
  for (const color of SONG_COLORS) {
    const raw = (input as Record<string, unknown>)[color];
    if (typeof raw !== 'string') continue;
    const label = raw.trim().slice(0, MAX_LABEL_LENGTH);
    if (label) out[color as SongColor] = label;
  }
  return out;
}

export async function setColorLabels(workspaceId: number, labels: unknown): Promise<ColorLabels> {
  const clean = sanitizeColorLabels(labels);
  await sql`
    update workspaces set color_labels = ${sql.json(clean)} where id = ${workspaceId}
  `;
  return clean;
}
