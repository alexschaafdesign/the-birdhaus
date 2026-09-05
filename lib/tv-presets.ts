import { sql } from './db';
import type { TvMode } from './tv-program';

// Saved TV presets (072_tv_presets.sql): named, reusable bundles of content for
// one mode, snapshotted from a scope and applied back into any scope. Category
// mirrors the three modes.

export type PresetCategory = Extract<TvMode, 'screensaver' | 'board' | 'cards'>;
export const PRESET_CATEGORIES: readonly PresetCategory[] = ['screensaver', 'board', 'cards'];
export function isPresetCategory(v: unknown): v is PresetCategory {
  return v === 'screensaver' || v === 'board' || v === 'cards';
}

interface ScreensaverData {
  // `active` is optional so presets saved before it was snapshotted still
  // apply (treated as active, matching the column default).
  images: Array<{ url: string; caption: string | null; active?: boolean }>;
}
interface BoardData {
  title: string | null;
  rows: Array<{ time: string; label: string }>;
}
interface CardsData {
  cards: Array<{ headline: string; subtext: string | null; image: string | null; active: boolean }>;
}
type PresetData = ScreensaverData | BoardData | CardsData;

export interface PresetSummary {
  id: number;
  category: PresetCategory;
  name: string;
  // A short count for the UI ("12 images", "5 rows", "3 cards").
  count: number;
  updatedAt: string;
}

function countOf(category: PresetCategory, data: PresetData): number {
  if (category === 'screensaver') return (data as ScreensaverData).images?.length ?? 0;
  if (category === 'board') return (data as BoardData).rows?.length ?? 0;
  return (data as CardsData).cards?.length ?? 0;
}

export async function listPresets(category: PresetCategory): Promise<PresetSummary[]> {
  const rows = await sql<Array<{ id: number; category: string; name: string; data: PresetData; updated_at: Date | string }>>`
    select id, category, name, data, updated_at
    from tv_presets
    where category = ${category}
    order by lower(name) asc
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    category: r.category as PresetCategory,
    name: r.name,
    count: countOf(category, r.data),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

// ---- snapshot: read a scope's current content into preset data -------------
export async function snapshotContent(category: PresetCategory, showId: number | null): Promise<PresetData> {
  if (category === 'screensaver') {
    // Screensaver is a single global pool (shared library), so snapshots always
    // come from the global images regardless of scope. Parked (inactive) images
    // are captured too, with their flag, so applying a preset restores the pool
    // exactly as it was saved.
    const rows = await sql<Array<{ url: string; caption: string | null; active: boolean }>>`
      select url, caption, active from tv_images order by sort asc, id asc
    `;
    return { images: rows.map((r) => ({ url: r.url, caption: r.caption, active: r.active })) };
  }
  if (category === 'board') {
    const [row] = await sql<Array<{ board_title: string | null; board_rows: unknown }>>`
      select board_title, board_rows from tv_program where show_id is not distinct from ${showId}
    `;
    const rows = Array.isArray(row?.board_rows) ? (row!.board_rows as Array<{ time?: unknown; label?: unknown }>) : [];
    return {
      title: row?.board_title ?? null,
      rows: rows
        .map((r) => ({
          time: typeof r?.time === 'string' ? r.time : '',
          label: typeof r?.label === 'string' ? r.label : '',
        }))
        .filter((r) => r.time || r.label),
    };
  }
  const rows = await sql<Array<{ headline: string; subtext: string | null; image: string | null; active: boolean }>>`
    select headline, subtext, image, active
    from tv_cards where show_id is not distinct from ${showId}
    order by sort asc, id asc
  `;
  return {
    cards: rows.map((r) => ({ headline: r.headline, subtext: r.subtext, image: r.image, active: r.active })),
  };
}

// Save (or overwrite) a preset from the current content of a scope. Returns id.
export async function savePreset(category: PresetCategory, name: string, showId: number | null): Promise<number> {
  const data = await snapshotContent(category, showId);
  const json = sql.json(data as unknown as Parameters<typeof sql.json>[0]);
  const [row] = await sql<Array<{ id: number }>>`
    insert into tv_presets (category, name, data)
    values (${category}, ${name}, ${json})
    on conflict (category, lower(name))
    do update set data = excluded.data, updated_at = now()
    returning id
  `;
  return Number(row.id);
}

// A single board preset's content, sanitized — for previewing/exporting a
// preset's run-of-show without applying it into a scope. null if the id isn't a
// board preset. (Screensaver/cards presets have no schedule board to render.)
export async function getPresetBoard(id: number): Promise<BoardData | null> {
  const [row] = await sql<Array<{ category: string; data: PresetData }>>`
    select category, data from tv_presets where id = ${id}
  `;
  if (!row || row.category !== 'board') return null;
  const d = row.data as BoardData;
  return {
    title: typeof d?.title === 'string' ? d.title : null,
    rows: (Array.isArray(d?.rows) ? d.rows : [])
      .map((r) => ({
        time: typeof r?.time === 'string' ? r.time : '',
        label: typeof r?.label === 'string' ? r.label : '',
      }))
      .filter((r) => r.time || r.label),
  };
}

// ---- apply: copy a preset's content into a scope ---------------------------
export async function applyPreset(presetId: number, showId: number | null): Promise<boolean> {
  const [row] = await sql<Array<{ category: string; data: PresetData }>>`
    select category, data from tv_presets where id = ${presetId}
  `;
  if (!row) return false;
  const category = row.category as PresetCategory;
  const data = row.data;

  await sql.begin(async (tx) => {
    if (category === 'screensaver') {
      const images = (data as ScreensaverData).images ?? [];
      await tx`delete from tv_images`;
      let i = 0;
      for (const img of images) {
        if (!img || typeof img.url !== 'string' || !img.url) continue;
        i += 1;
        await tx`
          insert into tv_images (url, caption, sort, active)
          values (${img.url}, ${typeof img.caption === 'string' ? img.caption : null}, ${i}, ${img.active !== false})
        `;
      }
    } else if (category === 'board') {
      const b = data as BoardData;
      const rows = (Array.isArray(b.rows) ? b.rows : []).filter((r) => r && (r.time || r.label));
      await tx`insert into tv_program (show_id, default_mode) values (${showId}, 'screensaver') on conflict do nothing`;
      await tx`
        update tv_program
        set board_title = ${b.title ?? null},
            board_rows = ${sql.json(rows as unknown as Parameters<typeof sql.json>[0])},
            updated_at = now()
        where show_id is not distinct from ${showId}
      `;
    } else {
      const cards = (data as CardsData).cards ?? [];
      await tx`delete from tv_cards where show_id is not distinct from ${showId}`;
      let i = 0;
      for (const c of cards) {
        if (!c || typeof c.headline !== 'string' || !c.headline) continue;
        i += 1;
        await tx`
          insert into tv_cards (show_id, headline, subtext, image, sort, active)
          values (${showId}, ${c.headline}, ${typeof c.subtext === 'string' ? c.subtext : null},
                  ${typeof c.image === 'string' ? c.image : null}, ${i}, ${c.active !== false})
        `;
      }
    }
  });
  return true;
}

export async function renamePreset(presetId: number, name: string): Promise<boolean> {
  const rows = await sql`update tv_presets set name = ${name}, updated_at = now() where id = ${presetId} returning id`;
  return rows.length > 0;
}

export async function deletePreset(presetId: number): Promise<void> {
  await sql`delete from tv_presets where id = ${presetId}`;
}
