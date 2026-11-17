'use client';

import { useMemo, useState } from 'react';
import type { ShowInputsState, InputBand } from '@/lib/inputs';
import type { InputCatalogItem } from '@/lib/input-catalog';
import { htmlToText, splitReplyQuote } from '@/lib/reply-text';
import { FORM } from '@/components/night/form';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from './ui';

const OTHER_KEY = 'other';

const inputClass = FIELD_INLINE;

// Editable row in the panel. A client-only uid keeps React keys stable across
// edits; ids aren't round-tripped since save replaces the whole set.
interface EditItem {
  uid: string;
  itemType: string;
  customLabel: string;
  quantity: number;
  note: string;
  useHouse: boolean;
}

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `row-${uidCounter}`;
}

function toEditItems(band: InputBand): EditItem[] {
  return band.items.map((it) => ({
    uid: nextUid(),
    itemType: it.itemType,
    customLabel: it.customLabel ?? '',
    quantity: it.quantity,
    note: it.note ?? '',
    useHouse: it.useHouse,
  }));
}

interface TotalLine {
  key: string;
  label: string;
  quantity: number;
  houseLabel: string | null;
  houseCount: number;
  ownCount: number;
}

// Mirrors lib/inputs.ts computeTotal so the total updates live as you edit
// (the server recomputes the same way on save/reload). Sum a band's own dup
// lines, then take the max across bands per aggregation key.
function computeTotal(
  bands: InputBand[],
  itemsByBand: Record<number, EditItem[]>,
  catalog: InputCatalogItem[]
): TotalLine[] {
  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const order = (k: string) => {
    const i = catalog.findIndex((c) => c.key === k);
    return i === -1 ? catalog.length : i;
  };
  const acc = new Map<
    string,
    { quantity: number; catalogKey: string; label: string; houseCount: number; ownCount: number }
  >();

  for (const band of bands) {
    const rows = itemsByBand[band.bandId] ?? [];
    const perBand = new Map<
      string,
      { quantity: number; catalogKey: string; label: string; usesHouse: boolean }
    >();
    for (const item of rows) {
      const isOther = item.itemType === OTHER_KEY;
      const key = isOther ? `other:${item.customLabel.trim().toLowerCase()}` : item.itemType;
      const label = isOther ? item.customLabel.trim() || 'Other' : byKey.get(item.itemType)?.label ?? item.itemType;
      const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? Math.floor(item.quantity) : 1;
      const prev = perBand.get(key);
      perBand.set(key, {
        quantity: (prev?.quantity ?? 0) + qty,
        catalogKey: item.itemType,
        label: prev?.label ?? label,
        usesHouse: (prev?.usesHouse ?? false) || item.useHouse,
      });
    }
    for (const [key, v] of perBand) {
      const eligible = !!byKey.get(v.catalogKey)?.houseLabel;
      const houseInc = eligible && v.usesHouse ? 1 : 0;
      const ownInc = eligible && !v.usesHouse ? 1 : 0;
      const prev = acc.get(key);
      if (!prev) {
        acc.set(key, {
          quantity: v.quantity,
          catalogKey: v.catalogKey,
          label: v.label,
          houseCount: houseInc,
          ownCount: ownInc,
        });
      } else {
        if (v.quantity > prev.quantity) prev.quantity = v.quantity;
        prev.houseCount += houseInc;
        prev.ownCount += ownInc;
      }
    }
  }

  return Array.from(acc.values())
    .map((v) => ({
      key: v.catalogKey,
      label: v.label,
      quantity: v.quantity,
      houseLabel: byKey.get(v.catalogKey)?.houseLabel ?? null,
      houseCount: v.houseCount,
      ownCount: v.ownCount,
    }))
    .sort((a, b) => order(a.key) - order(b.key) || a.label.localeCompare(b.label));
}

export default function ShowInputsPanel({
  initial,
  catalog,
}: {
  initial: ShowInputsState;
  catalog: InputCatalogItem[];
}) {
  const [bands] = useState(initial.bands);
  const [itemsByBand, setItemsByBand] = useState<Record<number, EditItem[]>>(() =>
    Object.fromEntries(initial.bands.map((b) => [b.bandId, toEditItems(b)]))
  );
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(initial.bands.map((b) => [b.bandId, toEditItems(b).map(stripUid)]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentSnapshot = JSON.stringify(
    bands.map((b) => [b.bandId, (itemsByBand[b.bandId] ?? []).map(stripUid)])
  );
  const dirty = currentSnapshot !== savedSnapshot;

  const total = useMemo(
    () => computeTotal(bands, itemsByBand, catalog),
    [bands, itemsByBand, catalog]
  );

  function updateRow(bandId: number, uid: string, patch: Partial<EditItem>) {
    setItemsByBand((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    }));
  }

  function addRow(bandId: number) {
    setItemsByBand((prev) => ({
      ...prev,
      [bandId]: [
        ...(prev[bandId] ?? []),
        { uid: nextUid(), itemType: catalog[0]?.key ?? 'vocal_mic', customLabel: '', quantity: 1, note: '', useHouse: false },
      ],
    }));
  }

  function removeRow(bandId: number, uid: string) {
    setItemsByBand((prev) => ({
      ...prev,
      [bandId]: (prev[bandId] ?? []).filter((r) => r.uid !== uid),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const items = bands.flatMap((b) =>
      (itemsByBand[b.bandId] ?? []).map((r, i) => ({
        bandId: b.bandId,
        itemType: r.itemType,
        customLabel: r.itemType === OTHER_KEY ? r.customLabel : null,
        quantity: r.quantity,
        note: r.note,
        useHouse: r.useHouse,
        sortOrder: i,
      }))
    );
    try {
      const res = await fetch(`/api/admin/shows/${initial.showId}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      const next = (await res.json()) as ShowInputsState;
      const nextItems = Object.fromEntries(next.bands.map((b) => [b.bandId, toEditItems(b)]));
      setItemsByBand(nextItems);
      setSavedSnapshot(
        JSON.stringify(next.bands.map((b) => [b.bandId, (nextItems[b.bandId] ?? []).map(stripUid)]))
      );
      setNotice('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className={ADMIN_TYPE.heading}>Input needs</h2>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-data-caption-13 text-surface-ink/60">Unsaved changes</span>}
          <a
            href={`/api/admin/shows/${initial.showId}/inputs/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            title={dirty ? 'PDF reflects the last saved version — save first' : 'Printable PDF'}
            className={buttonClassName('secondary', 's')}
          >
            Printable PDF
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className={`${buttonClassName('primary', 's')} disabled:opacity-50`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className={`${FORM.error} border-accent-red border-2 p-3`}>
          {error}
        </div>
      )}
      {notice && (
        <div className={FORM.notice}>
          {notice}
        </div>
      )}

      {/* Total needed */}
      <div className="border-surface-ink bg-surface-paper border p-4">
        <p className={`${ADMIN_TYPE.overline} mb-2`}>
          Total needed <span className="text-surface-ink/60 font-normal normal-case tracking-normal">· peak across the lineup (gear is reused between sets)</span>
        </p>
        {total.length === 0 ? (
          <p className="text-body-3 text-surface-ink/60">
            No items yet — add each band&apos;s needs below and the total builds here.
          </p>
        ) : (
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {total.map((line) => (
              <li key={`${line.key}:${line.label}`} className="flex items-baseline gap-2 text-body-3">
                <span className="tabular-nums font-bold text-surface-ink w-7 text-right">
                  {line.quantity}×
                </span>
                <span className="text-surface-ink/80">{line.label}</span>
                {line.houseLabel && line.houseCount > 0 && (
                  <span className="text-data-caption-13 text-surface-ink">
                    · {line.houseCount} using {line.houseLabel}
                    {line.ownCount > 0 && `, ${line.ownCount} bringing own`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-band entry */}
      {bands.length === 0 ? (
        <p className="text-body-3 text-surface-ink/60">No bands on this show yet.</p>
      ) : (
        <div className="space-y-5">
          {bands.map((band) => (
            <BandInputs
              key={band.bandId}
              band={band}
              rows={itemsByBand[band.bandId] ?? []}
              catalog={catalog}
              onAdd={() => addRow(band.bandId)}
              onUpdate={(uid, patch) => updateRow(band.bandId, uid, patch)}
              onRemove={(uid) => removeRow(band.bandId, uid)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BandInputs({
  band,
  rows,
  catalog,
  onAdd,
  onUpdate,
  onRemove,
}: {
  band: InputBand;
  rows: EditItem[];
  catalog: InputCatalogItem[];
  onAdd: () => void;
  onUpdate: (uid: string, patch: Partial<EditItem>) => void;
  onRemove: (uid: string) => void;
}) {
  return (
    <div className="border-surface-ink space-y-3 border p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className={ADMIN_TYPE.heading}>{band.name}</h3>
        {band.twinSceneStagePlotUrl && (
          <a
            href={band.twinSceneStagePlotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4"
          >
            Twin Scene plot ↗
          </a>
        )}
      </div>

      <BandReference band={band} />

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.uid} className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                min={1}
                max={99}
                value={row.quantity}
                onChange={(e) => onUpdate(row.uid, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                className={`${inputClass} w-16 tabular-nums`}
                aria-label="Quantity"
              />
              <span className="text-surface-ink/60 text-body-3">×</span>
              <select
                value={row.itemType}
                onChange={(e) => onUpdate(row.uid, { itemType: e.target.value })}
                className={`${inputClass} w-auto`}
                aria-label="Item type"
              >
                {catalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
              {row.itemType === OTHER_KEY && (
                <input
                  value={row.customLabel}
                  onChange={(e) => onUpdate(row.uid, { customLabel: e.target.value })}
                  placeholder="what is it?"
                  className={`${inputClass} w-40`}
                  aria-label="Custom item name"
                />
              )}
              <input
                value={row.note}
                onChange={(e) => onUpdate(row.uid, { note: e.target.value })}
                placeholder="note (optional)"
                className={`${inputClass} flex-1 min-w-[8rem]`}
                aria-label="Note"
              />
              {(() => {
                const houseLabel = catalog.find((c) => c.key === row.itemType)?.houseLabel;
                if (!houseLabel) return null;
                return (
                  <label className="flex items-center gap-1.5 text-data-caption-13 text-surface-ink/60 whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.useHouse}
                      onChange={(e) => onUpdate(row.uid, { useHouse: e.target.checked })}
                      className="accent-surface-ink size-4"
                    />
                    Will use {houseLabel}
                  </label>
                );
              })()}
              <button
                type="button"
                onClick={() => onRemove(row.uid)}
                className="text-surface-ink/60 hover:text-accent-red text-body-3 px-1"
                aria-label="Remove item"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onAdd}
        className={buttonClassName('secondary', 's')}
      >
        + Add item
      </button>
    </div>
  );
}

// Read-only reference for a band: what they wrote back on the advance thread
// plus an inline preview of any stage-plot file they sent — so Alex can
// transcribe gear without leaving the tab. Renders nothing if there's neither.
function BandReference({ band }: { band: InputBand }) {
  // Clean each reply the same way the advance thread does: prefer text/plain,
  // fall back to a text rendering of the HTML (never injected as HTML — external
  // sender), then peel off the quoted advance so only the new message shows.
  const replyTexts = band.replies
    .map((r) => {
      const raw = r.bodyText ?? (r.bodyHtml ? htmlToText(r.bodyHtml) : null);
      return raw ? splitReplyQuote(raw).body.trim() : '';
    })
    .filter(Boolean);

  if (replyTexts.length === 0 && band.stagePlotAttachments.length === 0) return null;

  return (
    <div className="bg-surface-paper-shade space-y-2 p-3">
      <p className={`${ADMIN_TYPE.overline} text-surface-ink/60`}>
        From their advance reply
      </p>
      {replyTexts.map((text, i) => (
        <p
          key={i}
          className="whitespace-pre-wrap text-body-3 text-surface-ink/80 border-l-2 border-surface-ink/20 pl-3"
        >
          {text}
        </p>
      ))}
      {band.stagePlotAttachments.map((a, i) => (
        <PlotPreview key={i} attachment={a} />
      ))}
    </div>
  );
}

function PlotPreview({
  attachment,
}: {
  attachment: InputBand['stagePlotAttachments'][number];
}) {
  const [open, setOpen] = useState(false);
  const type = attachment.contentType ?? '';
  const isPdf = type === 'application/pdf';
  const isImage = type.startsWith('image/');
  const previewable = isPdf || isImage;
  const name = attachment.filename || (isPdf ? 'stage plot.pdf' : 'stage plot');

  return (
    <div className="border border-surface-ink/20 bg-surface-paper">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span aria-hidden className="text-surface-ink/60 text-body-3">
          {isPdf ? '📄' : isImage ? '🖼️' : '📎'}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-3 text-surface-ink/80">{name}</span>
        {previewable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4"
          >
            {open ? 'Hide' : 'Preview'}
          </button>
        )}
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline underline-offset-4"
        >
          Open ↗
        </a>
      </div>
      {open && previewable && (
        <div className="border-t border-surface-ink/20 bg-surface-paper-shade p-2">
          {isPdf ? (
            <iframe src={attachment.url} title={name} className="h-[60vh] w-full bg-surface-paper" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachment.url} alt={name} className="max-h-[60vh] w-auto max-w-full" />
          )}
        </div>
      )}
    </div>
  );
}

// Snapshot shape for dirty-tracking — everything but the client-only uid.
function stripUid(r: EditItem): Omit<EditItem, 'uid'> {
  return {
    itemType: r.itemType,
    customLabel: r.customLabel,
    quantity: r.quantity,
    note: r.note,
    useHouse: r.useHouse,
  };
}
