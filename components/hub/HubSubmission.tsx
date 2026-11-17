'use client';

import { useMemo, useState } from 'react';
import { INPUT_CATALOG, OTHER_INPUT_KEY } from '@/lib/input-catalog';
import { normalizeScheduleTime } from '@/lib/schedule-time';
import type { ShowHubData } from '@/lib/show-hub';

type HubBand = ShowHubData['inputsByBand'][number];
type Attachment = HubBand['stagePlotAttachments'][number];
type ScheduleRows = ShowHubData['schedule'];

const inputClass =
  'bg-transparent border border-surface-ink px-2.5 py-1.5 text-body-3 focus:outline-none focus:border-accent-red placeholder:text-surface-ink/45';
const saveBtnClass =
  'bg-surface-ink text-surface-paper border-2 border-surface-ink inline-flex h-9.5 items-center justify-center px-4.5 text-body-3 font-bold ui-hover:bg-accent-red ui-hover:border-accent-red transition-colors cursor-pointer focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';

interface EditItem {
  uid: string;
  itemType: string;
  customLabel: string;
  quantity: number;
  note: string;
  useHouse: boolean;
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
    useHouse: it.useHouse,
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
  return [{ uid: nextUid(), itemType: 'vocal_mic', customLabel: '', quantity: 1, note: '', useHouse: false }];
}

// A band's own stage-plot upload + input-list builder. Remounted (via a key on
// the band id) when the band selection changes, so its state re-seeds from that
// band's saved data. Writes only its own band via the token-gated /api/hub routes.
export default function HubSubmission({
  token,
  band: bandProp,
  schedule,
  disabled = false,
}: {
  token: string;
  // Null when no band is selected yet: the form still renders (so bands see what
  // they'll need to fill in) but every control is disabled via the fieldset below.
  band: HubBand | null;
  schedule: ScheduleRows;
  disabled?: boolean;
}) {
  // Placeholder band for the disabled preview so the seed/state helpers have a
  // shape to read. Its id is never used to write — the fieldset blocks all input.
  const band: HubBand = bandProp ?? { bandId: -1, name: '', items: [], stagePlotAttachments: [] };
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
      { uid: nextUid(), itemType: INPUT_CATALOG[0].key, customLabel: '', quantity: 1, note: '', useHouse: false },
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
      useHouse: r.useHouse,
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
        useHouse: it.useHouse,
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
    // A disabled fieldset natively blocks every nested control (inputs, selects,
    // file upload, buttons) — one switch to lock the whole form until a band is
    // picked, with a dimmed look to match.
    <fieldset
      disabled={disabled}
      className={`space-y-6 ${disabled ? 'opacity-45 select-none' : ''}`}
    >
      {error && (
        <div className="border border-accent-red text-accent-red text-body-3 px-4 py-2">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-surface-ink text-surface-ink text-body-3 px-4 py-2">
          {notice}
        </div>
      )}

      {/* Stage plot upload */}
      <div className="space-y-3">
        <div>
          <h3 className="text-body-3 font-bold text-surface-ink">Stage plot / input list file</h3>
          <p className="text-data-caption-13 text-surface-ink/60">
            Upload a PDF or image (or a photo of a hand-drawn one). Max 15MB.
          </p>
        </div>
        {files.length > 0 && (
          <ul className="space-y-1.5">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-body-3">
                <span aria-hidden>{f.contentType === 'application/pdf' ? '📄' : '🖼️'}</span>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-accent-red cursor-pointer hover:underline underline"
                >
                  {f.filename || 'stage plot'}
                </a>
              </li>
            ))}
          </ul>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-body-3 border border-surface-ink px-3 py-1.5 hover:bg-surface-paper-shade transition-colors">
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
          <h3 className="text-body-3 font-bold text-surface-ink">
            Build your input list <span className="text-accent-red">*</span>
          </h3>
          <p className="text-data-caption-13 text-surface-ink/60">
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
                    <span className="text-surface-ink/60 text-body-3">×</span>
                    <select
                      value={row.itemType}
                      onChange={(e) => updateRow(row.uid, { itemType: e.target.value })}
                      className={`${inputClass} `}
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
                      className="text-surface-ink/60 hover:text-accent-red text-body-3 px-1"
                      aria-label="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                  {houseHint && (
                    <label className="flex items-start gap-2 pl-[4.5rem] text-data-caption-13 text-accent-red cursor-pointer">
                      <input
                        type="checkbox"
                        checked={row.useHouse}
                        onChange={(e) => updateRow(row.uid, { useHouse: e.target.checked })}
                        className="mt-0.5 accent-surface-ink"
                      />
                      <span>{houseHint}</span>
                    </label>
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
            className="text-body-3 text-surface-ink/60 hover:text-accent-red border border-surface-ink px-3 py-1.5 transition-colors"
          >
            + Add item
          </button>
          <button
            type="button"
            onClick={saveInputs}
            disabled={saving || !dirty}
            className="bg-surface-ink text-surface-paper border-2 border-surface-ink inline-flex h-9.5 items-center justify-center px-4.5 text-body-3 font-bold ui-hover:bg-accent-red ui-hover:border-accent-red transition-colors cursor-pointer focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save input list'}
          </button>
          {dirty && <span className="text-data-caption-13 text-surface-ink/60">Unsaved changes</span>}
        </div>
      </div>

      {/* Payout handle */}
      <div className="space-y-2 border-t border-surface-ink/20 pt-5">
        <h3 className="text-body-3 font-bold text-surface-ink">Your payout handle</h3>
        <PayoutTask token={token} bandId={band.bandId} />
      </div>

      {/* Schedule sign-off */}
      <div className="space-y-2 border-t border-surface-ink/20 pt-5">
        <h3 className="text-body-3 font-bold text-surface-ink">The schedule</h3>
        <ScheduleTask token={token} bandId={band.bandId} schedule={schedule} />
      </div>
    </fieldset>
  );
}

function Notice({ kind, children }: { kind: 'error' | 'ok'; children: React.ReactNode }) {
  const cls =
    kind === 'error'
      ? 'border-accent-red text-accent-red'
      : 'border-surface-ink text-surface-ink';
  return <div className={`border ${cls} text-body-3  px-3 py-1.5`}>{children}</div>;
}

// Venmo / payout handle → bands.payment_method (write-only from the shared link;
// never seeded from the server, so one band's handle isn't shown to whoever holds
// the link). Blank each visit; type + save.
function PayoutTask({ token, bandId }: { token: string; bandId: number }) {
  const [venmo, setVenmo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    if (!venmo.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch(`/api/hub/${token}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bandId, paymentMethod: venmo.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setSaved(venmo.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-data-caption-13 text-surface-ink/60">
        How should we pay you? Venmo (or other) handle. Private — goes straight to the Birdhaus.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {saved && <Notice kind="ok">Got it — we&apos;ll pay you at {saved}.</Notice>}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          placeholder="@your-venmo"
          className={`${inputClass} flex-1 min-w-[10rem]`}
          aria-label="Venmo or payout handle"
        />
        <button type="button" onClick={save} disabled={saving || !venmo.trim()} className={saveBtnClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Schedule sign-off: "looks good" or "I have changes" (with details). A confirm or
// change-request posts a plain, attributed message to the show's board.
function ScheduleTask({
  token,
  bandId,
  schedule,
}: {
  token: string;
  bandId: number;
  schedule: ScheduleRows;
}) {
  const [choice, setChoice] = useState<'' | 'ok' | 'changes'>('');
  const [changes, setChanges] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (choice === '') return;
    if (choice === 'changes' && !changes.trim()) {
      setError('Add the changes you need below.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/hub/${token}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bandId,
          schedule: { ok: choice === 'ok', changes: choice === 'changes' ? changes.trim() : '' },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* max-content time column so long ranges never wrap — matches the
          Schedule card in ShowHubView. */}
      {schedule.length > 0 ? (
        <ul className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 bg-surface-paper p-3">
          {schedule.map((row, i) => (
            <li key={i} className="contents text-body-3">
              <span className="whitespace-nowrap font-bold tabular-nums text-body-3 text-surface-ink">
                {normalizeScheduleTime(row.time)}
              </span>
              <span className="text-body-3 text-surface-ink/80">{row.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-data-caption-13 text-surface-ink/60">The schedule isn&apos;t posted yet — check back soon.</p>
      )}

      {error && <Notice kind="error">{error}</Notice>}
      {saved && (
        <Notice kind="ok">
          {choice === 'ok' ? 'Thanks — marked as good.' : 'Thanks — we got your changes.'}
        </Notice>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-body-3 text-surface-ink/80">
          <input
            type="radio"
            name={`sched-${bandId}`}
            checked={choice === 'ok'}
            onChange={() => {
              setChoice('ok');
              setSaved(false);
            }}
          />
          The schedule looks good
        </label>
        <label className="flex items-center gap-2 text-body-3 text-surface-ink/80">
          <input
            type="radio"
            name={`sched-${bandId}`}
            checked={choice === 'changes'}
            onChange={() => {
              setChoice('changes');
              setSaved(false);
            }}
          />
          I have changes — list below
        </label>
        {choice === 'changes' && (
          <textarea
            value={changes}
            onChange={(e) => setChanges(e.target.value)}
            rows={3}
            placeholder="e.g. we can't load in until 6:30…"
            className="w-full resize-y bg-transparent border border-surface-ink px-3 py-2 text-body-3 focus:outline-none focus:border-accent-red placeholder:text-surface-ink/45"
          />
        )}
      </div>

      <button type="button" onClick={save} disabled={saving || choice === ''} className={saveBtnClass}>
        {saving ? 'Saving…' : 'Submit schedule response'}
      </button>
    </div>
  );
}

// Dirty-tracking snapshot — everything but the client-only uid.
function snapshot(rows: EditItem[]): string {
  return JSON.stringify(
    rows.map((r) => ({ itemType: r.itemType, customLabel: r.customLabel, quantity: r.quantity, note: r.note, useHouse: r.useHouse }))
  );
}
