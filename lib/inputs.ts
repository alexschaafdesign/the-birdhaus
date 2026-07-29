import { sql } from './db';
import {
  inputCatalogItem,
  inputCatalogOrder,
  isInputCatalogKey,
  OTHER_INPUT_KEY,
} from './input-catalog';

// One gear line a band needs. id is present for stored rows, absent for ones the
// admin just added in the panel (save replaces the whole set, so ids aren't
// round-tripped for identity — they're only informational).
export interface InputItem {
  id: number | null;
  itemType: string;
  customLabel: string | null;
  quantity: number;
  note: string | null;
  sortOrder: number;
}

// A lineup band with its input items, plus any stage-plot files it sent in the
// advance thread (surfaced here so Alex can read the plot while transcribing it)
// and a link to its Twin Scene stage plot if one exists.
// A band's inbound reply on the advance thread, surfaced here as read-only
// reference while transcribing gear. Bodies are raw (cleaned client-side with
// lib/reply-text, same as the advance thread) — the sender is external.
export interface InputBandReply {
  bodyText: string | null;
  bodyHtml: string | null;
  createdAt: string;
}

export interface InputBand {
  bandId: number;
  name: string;
  twinSceneStagePlotUrl: string | null;
  stagePlotAttachments: Array<{ filename: string | null; url: string; contentType: string | null }>;
  replies: InputBandReply[];
  items: InputItem[];
}

// One line in the rolled-up "total needed". quantity is the peak simultaneous
// need — the max any single band needs — since gear is reused between sets.
export interface InputTotalLine {
  key: string;
  label: string;
  quantity: number;
  houseLabel: string | null;
}

export interface ShowInputsState {
  showId: number;
  bands: InputBand[];
  total: InputTotalLine[];
}

// Twin Scene band pages live at twinscene.org/bands/{slug}; each band's stage
// plots are under /stage-plots. Only a reference link — no API call (there's no
// public stage-plot endpoint; see ../twinscene/ARCHITECTURE.md).
function twinSceneStagePlotUrl(slug: string | null): string | null {
  return slug ? `https://twinscene.org/bands/${slug}/stage-plots` : null;
}

// The aggregation key for a line: the catalog key, except 'other' lines key off
// their (normalized) custom label so two bands' "smoke machine" total together
// but "smoke machine" and "fog juice" don't.
function aggregationKey(itemType: string, customLabel: string | null): string {
  if (itemType === OTHER_INPUT_KEY) {
    return `other:${(customLabel ?? '').trim().toLowerCase()}`;
  }
  return itemType;
}

function normalizeQuantity(input: unknown): number {
  const n = Math.floor(Number(input));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 99);
}

// Computes the "total needed" from every band's items: sum duplicate lines
// within a band, then take the max across bands per aggregation key.
function computeTotal(bands: InputBand[]): InputTotalLine[] {
  // key -> { max quantity, a representative catalog key + display label }
  const acc = new Map<
    string,
    { quantity: number; catalogKey: string; label: string }
  >();

  for (const band of bands) {
    // Sum this band's own duplicate lines first (peak within the band).
    const perBand = new Map<string, { quantity: number; catalogKey: string; label: string }>();
    for (const item of band.items) {
      const key = aggregationKey(item.itemType, item.customLabel);
      const catalog = inputCatalogItem(item.itemType);
      const label =
        item.itemType === OTHER_INPUT_KEY
          ? (item.customLabel?.trim() || 'Other')
          : catalog.label;
      const prev = perBand.get(key);
      perBand.set(key, {
        quantity: (prev?.quantity ?? 0) + item.quantity,
        catalogKey: item.itemType,
        label: prev?.label ?? label,
      });
    }
    // Fold this band's peaks into the running max across bands.
    for (const [key, v] of perBand) {
      const prev = acc.get(key);
      if (!prev || v.quantity > prev.quantity) {
        acc.set(key, { quantity: v.quantity, catalogKey: v.catalogKey, label: prev?.label ?? v.label });
      } else if (!prev.label) {
        prev.label = v.label;
      }
    }
  }

  return Array.from(acc.values())
    .map((v) => ({
      key: v.catalogKey,
      label: v.label,
      quantity: v.quantity,
      houseLabel: inputCatalogItem(v.catalogKey).houseLabel ?? null,
    }))
    .sort(
      (a, b) =>
        inputCatalogOrder(a.key) - inputCatalogOrder(b.key) ||
        a.label.localeCompare(b.label)
    );
}

// Full state for the Inputs tab: the current (non-excluded) lineup in stage
// order, each band's saved items + stage-plot files, and the computed total.
export async function getShowInputsState(showId: number): Promise<ShowInputsState | null> {
  const [showExists] = await sql<Array<{ id: number }>>`
    select id from shows where id = ${showId}
  `;
  if (!showExists) return null;

  const [bandRows, itemRows, attachmentRows, replyRows] = await Promise.all([
    sql<Array<{ band_id: number; name: string; twinscene_slug: string | null; sort_order: number }>>`
      select b.id as band_id, b.name, b.twinscene_slug, sb.sort_order
      from show_bands sb
      join bands b on b.id = sb.band_id
      where sb.show_id = ${showId} and not sb.excluded
      order by sb.sort_order
    `,
    sql<Array<{
      id: number;
      band_id: number;
      item_type: string;
      custom_label: string | null;
      quantity: number;
      note: string | null;
      sort_order: number;
    }>>`
      select id, band_id, item_type, custom_label, quantity, note, sort_order
      from show_input_items
      where show_id = ${showId}
      order by band_id, sort_order, id
    `,
    // Stage-plot files bands sent in the advance thread, attributed by the
    // reply's band_id. Only inbound messages carry a band_id worth grouping on.
    sql<Array<{ band_id: number | null; filename: string | null; url: string; content_type: string | null }>>`
      select m.band_id, a.filename, a.url, a.content_type
      from advance_attachments a
      join advance_messages m on m.id = a.message_id
      where a.show_id = ${showId} and m.direction = 'inbound'
      order by a.created_at asc
    `,
    // Bands' inbound reply bodies, shown as read-only reference next to each
    // band's input rows so Alex can transcribe without leaving the tab.
    sql<Array<{ band_id: number | null; body_text: string | null; body_html: string | null; created_at: string }>>`
      select band_id, body_text, body_html, created_at::text as created_at
      from advance_messages
      where show_id = ${showId} and direction = 'inbound'
      order by created_at asc
    `,
  ]);

  const itemsByBand = new Map<number, InputItem[]>();
  for (const r of itemRows) {
    const list = itemsByBand.get(Number(r.band_id)) ?? [];
    list.push({
      id: Number(r.id),
      itemType: r.item_type,
      customLabel: r.custom_label,
      quantity: Number(r.quantity),
      note: r.note,
      sortOrder: Number(r.sort_order),
    });
    itemsByBand.set(Number(r.band_id), list);
  }

  const attachmentsByBand = new Map<number, InputBand['stagePlotAttachments']>();
  for (const a of attachmentRows) {
    if (a.band_id === null) continue;
    const list = attachmentsByBand.get(Number(a.band_id)) ?? [];
    list.push({ filename: a.filename, url: a.url, contentType: a.content_type });
    attachmentsByBand.set(Number(a.band_id), list);
  }

  const repliesByBand = new Map<number, InputBandReply[]>();
  for (const r of replyRows) {
    if (r.band_id === null) continue;
    const list = repliesByBand.get(Number(r.band_id)) ?? [];
    list.push({ bodyText: r.body_text, bodyHtml: r.body_html, createdAt: r.created_at });
    repliesByBand.set(Number(r.band_id), list);
  }

  const bands: InputBand[] = bandRows.map((b) => ({
    bandId: Number(b.band_id),
    name: b.name,
    twinSceneStagePlotUrl: twinSceneStagePlotUrl(b.twinscene_slug),
    stagePlotAttachments: attachmentsByBand.get(Number(b.band_id)) ?? [],
    replies: repliesByBand.get(Number(b.band_id)) ?? [],
    items: itemsByBand.get(Number(b.band_id)) ?? [],
  }));

  return { showId, bands, total: computeTotal(bands) };
}

// Wholesale-replaces the show's input items with the provided set. Only items
// for bands currently in the (non-excluded) lineup are kept — an item for a band
// since removed from the show is dropped. Runs in a transaction so a mid-save
// failure can't leave the show with a half-written list.
export async function saveShowInputs(
  showId: number,
  itemsInput: unknown
): Promise<ShowInputsState | null> {
  const [showExists] = await sql<Array<{ id: number }>>`
    select id from shows where id = ${showId}
  `;
  if (!showExists) return null;

  const lineup = await sql<Array<{ band_id: number }>>`
    select band_id from show_bands where show_id = ${showId} and not excluded
  `;
  const lineupIds = new Set(lineup.map((r) => Number(r.band_id)));

  const raw = Array.isArray(itemsInput) ? itemsInput : [];
  const clean = raw
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const bandId = Number(o.bandId);
      const itemType = typeof o.itemType === 'string' && isInputCatalogKey(o.itemType) ? o.itemType : null;
      if (!Number.isInteger(bandId) || !lineupIds.has(bandId) || !itemType) return null;
      const customLabel =
        itemType === OTHER_INPUT_KEY && typeof o.customLabel === 'string'
          ? o.customLabel.trim().slice(0, 120) || null
          : null;
      const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim().slice(0, 500) : null;
      const sortOrder = Number.isInteger(Number(o.sortOrder)) ? Number(o.sortOrder) : 0;
      return {
        bandId,
        itemType,
        customLabel,
        quantity: normalizeQuantity(o.quantity),
        note,
        sortOrder,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  await sql.begin(async (tx) => {
    await tx`delete from show_input_items where show_id = ${showId}`;
    for (const [i, it] of clean.entries()) {
      await tx`
        insert into show_input_items
          (show_id, band_id, item_type, custom_label, quantity, note, sort_order)
        values
          (${showId}, ${it.bandId}, ${it.itemType}, ${it.customLabel},
           ${it.quantity}, ${it.note}, ${it.sortOrder || i})
      `;
    }
  });

  return getShowInputsState(showId);
}
