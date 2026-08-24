'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Mirrors app/api/admin/uploads/route.ts's limits — checked here too so an
// oversized/wrong-type file never has to make a round trip just to be rejected.
const MAX_FLYER_BYTES = 8 * 1024 * 1024;
const ALLOWED_FLYER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Admin create/edit form for a Song Club event. `mode: "add"` POSTs to
// /api/admin/song-club; `mode: "edit"` PATCHes /api/admin/song-club/[id]. A
// chosen flyer is uploaded first to the shared /api/admin/uploads route (folder
// "song-club"), and the returned URL is saved on the event record.
export interface SongClubEventFormValues {
  id?: number;
  title: string;
  eventDate: string; // yyyy-mm-dd
  startTime: string;
  endTime: string;
  venueName: string;
  address: string;
  arrivalNotes: string;
  description: string;
  flyerUrl: string;
  published: boolean;
  playlistId: number | null;
  format: 'in_person' | 'online';
}

const inputClass =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-[#E8E0D0]/40">{hint}</p>}
    </div>
  );
}

export default function SongClubEventForm({
  mode,
  initial,
  rounds = [],
}: {
  mode: 'add' | 'edit';
  initial?: Partial<SongClubEventFormValues>;
  rounds?: Array<{ id: number; title: string }>;
}) {
  const router = useRouter();
  const [v, setV] = useState<SongClubEventFormValues>({
    title: initial?.title ?? '',
    eventDate: initial?.eventDate ?? '',
    startTime: initial?.startTime ?? '',
    endTime: initial?.endTime ?? '',
    venueName: initial?.venueName ?? '',
    address: initial?.address ?? '',
    arrivalNotes: initial?.arrivalNotes ?? '',
    description: initial?.description ?? '',
    flyerUrl: initial?.flyerUrl ?? '',
    published: initial?.published ?? false,
    playlistId: initial?.playlistId ?? null,
    format: initial?.format ?? 'in_person',
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  const flyerInputRef = useRef<HTMLInputElement>(null);
  const [flyerFile, setFlyerFile] = useState<File | null>(null);
  const [flyerPreview, setFlyerPreview] = useState<string | null>(initial?.flyerUrl ?? null);
  const [flyerError, setFlyerError] = useState('');

  const set =
    (k: keyof SongClubEventFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  function handleFlyerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;

    if (!ALLOWED_FLYER_TYPES.has(file.type)) {
      setFlyerError('Unsupported image type — use JPEG, PNG, WebP, or GIF');
      input.value = '';
      return;
    }
    if (file.size > MAX_FLYER_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setFlyerError(`That image is ${mb}MB — please use a file under 8MB`);
      input.value = '';
      return;
    }

    setFlyerError('');
    setFlyerFile(file);
    setFlyerPreview(URL.createObjectURL(file));
  }

  function removeFlyer() {
    setFlyerFile(null);
    setFlyerPreview(null);
    setFlyerError('');
    setV((prev) => ({ ...prev, flyerUrl: '' }));
    if (flyerInputRef.current) flyerInputRef.current.value = '';
  }

  /** Uploads the chosen flyer to the shared image route and returns its URL,
   * or throws with a user-facing message on failure. */
  async function uploadFlyer(): Promise<string> {
    const form = new FormData();
    form.append('file', flyerFile as File);
    form.append('folder', 'song-club');
    const res = await fetch('/api/admin/uploads', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.url) {
      throw new Error(data?.error || "Couldn't upload that image. Try a different file, or try again in a moment.");
    }
    return data.url as string;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const flyerUrl = flyerFile ? await uploadFlyer() : v.flyerUrl;

      const payload = {
        title: v.title,
        eventDate: v.eventDate,
        startTime: v.startTime,
        endTime: v.endTime,
        venueName: v.venueName,
        address: v.address,
        arrivalNotes: v.arrivalNotes,
        description: v.description,
        flyerUrl,
        published: v.published,
        playlistId: v.playlistId,
        format: v.format,
      };

      const res =
        mode === 'add'
          ? await fetch('/api/admin/song-club', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/admin/song-club/${initial?.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Something went wrong');
        setStatus('error');
        return;
      }

      router.push('/admin/song-club');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Title">
        <input className={inputClass} value={v.title} onChange={set('title')} required />
      </Field>

      <Field
        label="Format"
        hint={
          v.format === 'online'
            ? 'Online / Song-a-day: no RSVP — members "Sign me up" to join in the portal.'
            : 'In-person: public RSVP form + "I participated" to unlock the round.'
        }
      >
        <div className="inline-flex rounded-lg border border-[#E8E0D0]/20 p-1">
          {([
            ['in_person', 'In-person'],
            ['online', 'Online / Song-a-day'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setV((prev) => ({ ...prev, format: value }))}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                v.format === value
                  ? 'bg-[#E8E0D0] text-[#2A2420]'
                  : 'text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date">
          <input type="date" className={inputClass} value={v.eventDate} onChange={set('eventDate')} required />
        </Field>
        <Field label="Start time" hint='e.g. "7:00 PM"'>
          <input className={inputClass} value={v.startTime} onChange={set('startTime')} placeholder="7:00 PM" />
        </Field>
        <Field label="End time">
          <input className={inputClass} value={v.endTime} onChange={set('endTime')} placeholder="9:00 PM" />
        </Field>
      </div>

      {v.format === 'in_person' && (
        <>
          <Field label="Venue name">
            <input className={inputClass} value={v.venueName} onChange={set('venueName')} />
          </Field>
          <Field label="Address" hint="Emailed to attendees who RSVP">
            <input className={inputClass} value={v.address} onChange={set('address')} placeholder="123 Main St, Minneapolis MN 55407" />
          </Field>
          <Field label="Arrival notes" hint="Parking, how to find the door, etc. — included in the email">
            <textarea className={`${inputClass} min-h-16`} value={v.arrivalNotes} onChange={set('arrivalNotes')} />
          </Field>
        </>
      )}
      <Field label="Description / theme" hint="Shown on the event page and included in the confirmation email">
        <textarea className={`${inputClass} min-h-24`} value={v.description} onChange={set('description')} />
      </Field>
      <Field label="Flyer" hint="Optional — JPG, PNG, WebP, or GIF.">
        <div className="flex items-center gap-3">
          {flyerPreview && (
            // eslint-disable-next-line @next/next/no-img-element -- local/remote preview
            <img
              src={flyerPreview}
              alt=""
              className="h-16 w-16 shrink-0 rounded-md object-cover ring-1 ring-[#E8E0D0]/15"
            />
          )}
          <input
            ref={flyerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFlyerChange}
            className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded-md file:border file:border-[#E8E0D0]/25 file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0] hover:file:border-[#E8E0D0]/50"
          />
        </div>
        {flyerError && <p className="mt-1 text-sm text-[#F5A3A3]">{flyerError}</p>}
        {flyerPreview && (
          <button
            type="button"
            onClick={removeFlyer}
            className="mt-2 text-xs text-[#E8E0D0]/50 underline underline-offset-2 hover:text-[#E8E0D0]"
          >
            Remove flyer
          </button>
        )}
      </Field>

      {rounds.length > 0 && (
        <Field label="Song Club round" hint="Optional — links the public event page to this round in the members' portal">
          <select
            className={inputClass}
            value={v.playlistId ?? ''}
            onChange={(e) =>
              setV((prev) => ({
                ...prev,
                playlistId: e.target.value ? Number(e.target.value) : null,
              }))
            }
          >
            <option value="">None</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm text-[#E8E0D0]/85">
        <input
          type="checkbox"
          checked={v.published}
          onChange={(e) => setV((prev) => ({ ...prev, published: e.target.checked }))}
          className="h-4 w-4 accent-[#E8E0D0]"
        />
        Published (visible on the public Song Club page + accepts RSVPs)
      </label>

      {error && <p className="text-sm text-[#F5A3A3]">{error}</p>}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={status === 'saving'}
          className="rounded-md bg-[#E8E0D0] px-4 py-2 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
        >
          {status === 'saving' ? 'Saving…' : mode === 'add' ? 'Create event' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
