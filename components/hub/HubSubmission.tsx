'use client';

import { useMemo, useState } from 'react';
import { INPUT_CATALOG, OTHER_INPUT_KEY } from '@/lib/input-catalog';
import type { ShowHubData } from '@/lib/show-hub';

type HubBand = ShowHubData['inputsByBand'][number];
type Attachment = HubBand['stagePlotAttachments'][number];

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

interface EditItem {
  uid: string;
  itemType: string;
  customLabel: string;
  quantity: number;
  note: string;
}

// Contextual reminders shown under a row when a band picks gear the house
// commonly provides — so they know the house option exists (and, for drums, what
// to still bring). Keyed by input-catalog key; only the house-backed items have
// one. Copy lives here (portal UI) rather than the shared catalog.
const HOUSE_GEAR_HINTS: Record<string, string> = {
  bass_amp: 'There’s a house bass amp — want to use it? Note it here (or let us know if you’re bringing your own).',
  guitar_amp: 'Two house guitar amps are available (Fender Blues Jr + Peavey Classic 30) — let us know if you’d like to use one.',
  drum_kit: 'Reminder: there’s a house kit to share, but bring your own breakables (snare/cymbals) if you’d like!',
};

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `hub-row-${uidCounter}`;
}

function toEditItems(band: HubBand): EditItem[] {
  return band.items.map((it) => ({
    uid: nextUid(),
    itemType: it.itemType,
    customLabel: it.customLabel ?? '',
    quantity: it.quantity,
    note: it.note ?? '',
  }));
}

// The input list is required, so a band that hasn't saved anything yet starts
// with one visible row (a vocal mic — the most common first input) rather than
// an empty section that's easy to skip. Bands with saved items load those as-is.
// The seeded row reads as an unsaved change (savedSnapshot stays the true empty
// state), which enables the Save button and nudges them to confirm it.
function initialEditItems(band: HubBand): EditItem[] {
  const saved = toEditItems(band);
  if (saved.length > 0) return saved;
  return [{ uid: nextUid(), itemType: 'vocal_mic', customLabel: '', quantity: 1, note: '' }];
}

// A band's own stage-plot upload + input-list builder. Remounted (via a key on
// the band id) when the band selection changes, so its state re-seeds from that
// band's saved data. Writes only its own band via the token-gated /api/hub routes.
export default function HubSubmission({ token, band }: { token: string; band: HubBand }) {
  const [rows, setRows] = useState<EditItem[]>(() => initialEditItems(band));
  const [savedSnapshot, setSavedSnapshot] = useState(() => snapshot(toEditItems(band)));
  const [files, setFiles] = useState<Attachment[]>(band.stagePlotAttachments);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dirty = useMemo(() => snapshot(rows) !== savedSnapshot, [rows, savedSnapshot]);

  function updateRow(uid: string, patch: Partial<EditItem>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      { uid: nextUid(), itemType: INPUT_CATALOG[0].key, customLabel: '', quantity: 1, note: '' },
    ]);
  }
  function removeRow(uid: string) {
    setRows((prev) => prev.filter((r) => r.uid !== uid));
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('bandId', String(band.bandId));
      const res = await fetch(`/api/hub/${token}/stage-plot`, { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`);
      setFiles((prev) => [...prev, { filename: data.filename, url: data.url, contentType: file.type }]);
      setNotice('Stage plot uploaded — thanks!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function saveInputs() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const items = rows.map((r, i) => ({
      itemType: r.itemType,
      customLabel: r.itemType === OTHER_INPUT_KEY ? r.customLabel : null,
      quantity: r.quantity,
      note: r.note,
      sortOrder: i,
    }));
    try {
      const res = await fetch(`/api/hub/${token}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandId: band.bandId, items }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      const next: EditItem[] = (data.items ?? []).map((it: EditItem & { customLabel: string | null }) => ({
        uid: nextUid(),
        itemType: it.itemType,
        customLabel: it.customLabel ?? '',
        quantity: it.quantity,
        note: it.note ?? '',
      }));
      setRows(next);
      setSavedSnapshot(snapshot(next));
      setNotice('Input list saved — thanks!');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-200 text-sm rounded px-4 py-2">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-emerald-400/40 bg-emerald-400/10 text-emerald-100 text-sm rounded px-4 py-2">
          {notice}
        </div>
      )}

      {/* Stage plot upload */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#E8E0D0]">Stage plot / input list file</h3>
          <p className="text-xs text-[#E8E0D0]/50">
            Upload a PDF or image (or a photo of a hand-drawn one). Max 15MB.
          </p>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span aria-hidden>{f.contentType === 'application/pdf' ? '📄' : '🖼️'}</span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-[#c8a26a] hover:text-[#E8E0D0] underline"
                >
                  {f.filename || 'stage plot'}
                </a>
              </li>
            ))}
          </ul>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 transition-colors">
          {uploading ? 'Uploading…' : files.length > 0 ? '+ Add another file' : '+ Upload a file'}
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {/* Input-list builder */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#E8E0D0]">
            Build your input list <span className="text-[#c8a26a]">*</span>
          </h3>
          <p className="text-xs text-[#E8E0D0]/50">
            Required — list everything you need on stage (mics, DIs, amps, etc.). We&apos;ve
            started you off with a vocal mic; adjust it and add the rest, then save.
          </p>
        </div>

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => {
              const houseHint = HOUSE_GEAR_HINTS[row.itemType];
              return (
                <div key={row.uid} className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={row.quantity}
                      onChange={(e) => updateRow(row.uid, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className={`${inputClass} w-16 tabular-nums`}
                      aria-label="Quantity"
                    />
                    <span className="text-[#E8E0D0]/40 text-sm">×</span>
                    <select
                      value={row.itemType}
                      onChange={(e) => updateRow(row.uid, { itemType: e.target.value })}
                      className={`${inputClass} [&>option]:bg-[#2A2420]`}
                      aria-label="Item type"
                    >
                      {INPUT_CATALOG.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {row.itemType === OTHER_INPUT_KEY && (
                      <input
                        value={row.customLabel}
                        onChange={(e) => updateRow(row.uid, { customLabel: e.target.value })}
                        placeholder="what is it?"
                        className={`${inputClass} w-40`}
                        aria-label="Custom item name"
                      />
                    )}
                    <input
                      value={row.note}
                      onChange={(e) => updateRow(row.uid, { note: e.target.value })}
                      placeholder="note (optional)"
                      className={`${inputClass} flex-1 min-w-[8rem]`}
                      aria-label="Note"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.uid)}
                      className="text-[#E8E0D0]/40 hover:text-red-300 text-sm px-1"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                  {houseHint && (
                    <p className="pl-[4.5rem] text-xs text-[#c8a26a]/90">{houseHint}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={addRow}
            className="text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] border border-[#E8E0D0]/25 rounded px-3 py-1.5 transition-colors"
          >
            + Add item
          </button>
          <button
            type="button"
            onClick={saveInputs}
            disabled={saving || !dirty}
            className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-5 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save input list'}
          </button>
          {dirty && <span className="text-xs text-[#E8E0D0]/40">Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}

// Dirty-tracking snapshot — everything but the client-only uid.
function snapshot(rows: EditItem[]): string {
  return JSON.stringify(
    rows.map((r) => ({ itemType: r.itemType, customLabel: r.customLabel, quantity: r.quantity, note: r.note }))
  );
}
