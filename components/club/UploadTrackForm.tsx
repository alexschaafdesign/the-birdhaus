'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// Parse "YYYY-MM-DD" as LOCAL midnight — a bare date string parses as UTC
// midnight and would label the previous day.
function localDate(day: string): Date {
  return new Date(day + 'T00:00:00');
}

// Today as "YYYY-MM-DD" in Song Club's home timezone, so a 12:30am upload
// still defaults sensibly (and can be flipped back to "yesterday" by hand —
// that's expected, not an edge case).
function todayCentral(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// Every date of the event, start through end inclusive.
function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const d = localDate(start);
  // Hard cap keeps a bad range from looping forever (song-a-days run ~10 days).
  for (let i = 0; i < 62; i++) {
    const iso = d.toLocaleDateString('en-CA');
    if (iso > end) break;
    days.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function dayOptionLabel(day: string, start: string): string {
  const n = Math.round((localDate(day).getTime() - localDate(start).getTime()) / 86400000) + 1;
  const label = localDate(day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `Day ${n} — ${label}`;
}

// Three-step upload: ask the API for a presigned URL, PUT the audio straight
// to R2 (XHR, for upload progress — the file never touches Vercel), then
// register the uploaded key as a track. Lands on the round (or the track's
// page for a single) when done.
export default function UploadTrackForm({
  playlists,
  defaultPlaylistId,
  eventRanges = {},
}: {
  playlists: Array<{ id: number; title: string }>;
  defaultPlaylistId?: number;
  // Date range of each event-linked round, keyed by playlist id — rounds in
  // here get the "which day" picker.
  eventRanges?: Record<number, { start: string; end: string }>;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  // Show the destination picker only when there's a real choice — two or more
  // playlists to pick among. With a single playlist the song goes there
  // implicitly; with none it's just a single. Either way, no needless field.
  const showPlaylistPicker = playlists.length >= 2;
  const [playlistId, setPlaylistId] = useState<string>(
    defaultPlaylistId
      ? String(defaultPlaylistId)
      : playlists.length === 1
        ? String(playlists[0].id)
        : ''
  );
  // '' = "use the default" (today, clamped into the event's range) so the
  // right day stays selected when switching rounds.
  const [day, setDay] = useState<string>('');
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = playlistId ? eventRanges[Number(playlistId)] : undefined;
  const dayOptions = range ? enumerateDays(range.start, range.end) : [];
  const defaultDay = range
    ? todayCentral() < range.start
      ? range.start
      : todayCentral() > range.end
        ? range.end
        : todayCentral()
    : '';
  const selectedDay = day && dayOptions.includes(day) ? day : defaultDay;

  // Decode the audio in-browser and downsample to a compact peak array (+
  // duration) so the player can draw the waveform without re-downloading and
  // decoding the file on every view. Best-effort: returns nulls if decode
  // fails (unsupported codec, etc.) and the player falls back to a plain bar.
  async function computeWaveform(
    f: File
  ): Promise<{ peaks: number[] | null; durationSeconds: number | null }> {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const channel = buf.getChannelData(0);
      const samples = 800;
      const block = Math.floor(channel.length / samples) || 1;
      const peaks: number[] = [];
      for (let i = 0; i < samples; i++) {
        let max = 0;
        const start = i * block;
        for (let j = 0; j < block; j++) {
          const v = Math.abs(channel[start + j] || 0);
          if (v > max) max = v;
        }
        peaks.push(Math.round(max * 1000) / 1000);
      }
      const duration = buf.duration;
      await ctx.close();
      // Normalize so the loudest peak fills the height.
      const peak = Math.max(...peaks, 0.01);
      return { peaks: peaks.map((p) => Math.round((p / peak) * 1000) / 1000), durationSeconds: duration };
    } catch {
      return { peaks: null, durationSeconds: null };
    }
  }

  function putWithProgress(url: string, body: File, contentType: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
      xhr.send(body);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      // Compute the waveform before uploading (cheap, and the file's already
      // in memory).
      const { peaks, durationSeconds } = await computeWaveform(file);

      const urlRes = await fetch('/api/club/tracks/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, sizeBytes: file.size }),
      });
      const urlData = await urlRes.json().catch(() => null);
      if (!urlRes.ok) throw new Error(urlData?.error ?? `Couldn't start upload (${urlRes.status})`);

      await putWithProgress(urlData.uploadUrl, file, urlData.contentType);

      const trackRes = await fetch('/api/club/tracks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: urlData.key,
          uploadToken: urlData.uploadToken,
          title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
          notes,
          contentType: urlData.contentType,
          playlistId: playlistId ? Number(playlistId) : null,
          day: selectedDay || null,
          peaks,
          durationSeconds,
        }),
      });
      const trackData = await trackRes.json().catch(() => null);
      if (!trackRes.ok) throw new Error(trackData?.error ?? `Couldn't save (${trackRes.status})`);

      router.push(playlistId ? `/song-club/music/${playlistId}` : `/song-club/track/${trackData.track.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className={labelClass}>Audio file</label>
        <input
          type="file"
          required
          accept="audio/*,.mp3,.m4a,.wav,.aif,.aiff,.flac,.ogg,.opus"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded file:border-0 file:bg-[#E8E0D0]/15 file:px-3 file:py-1.5 file:text-sm file:text-[#E8E0D0]"
        />
        <p className="mt-1 text-xs text-[#E8E0D0]/40">
          mp3, m4a, wav, aiff, flac, or ogg — up to 250 MB.
        </p>
      </div>

      <div>
        <label htmlFor="track-title" className={labelClass}>
          Title
        </label>
        <input
          type="text"
          id="track-title"
          placeholder={file ? file.name.replace(/\.[^.]+$/, '') : 'Song title'}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputBase}
        />
      </div>

      <div>
        <label htmlFor="track-notes" className={labelClass}>
          Notes (optional)
        </label>
        <textarea
          id="track-notes"
          rows={3}
          placeholder="Anything the club should know — the prompt, what feedback you want…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={`${inputBase} resize-y`}
        />
      </div>

      {showPlaylistPicker && (
        <div>
          <label htmlFor="track-playlist" className={labelClass}>
            Add to a playlist
          </label>
          <select
            id="track-playlist"
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className={inputBase}
          >
            <option value="">None — just a single</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {range && dayOptions.length > 0 && (
        <div>
          <label htmlFor="track-day" className={labelClass}>
            Which day is this for?
          </label>
          <select
            id="track-day"
            value={selectedDay}
            onChange={(e) => setDay(e.target.value)}
            className={inputBase}
          >
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {dayOptionLabel(d, range.start)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[#E8E0D0]/40">
            Finishing last night&apos;s song after midnight? Just pick yesterday.
          </p>
        </div>
      )}

      {progress !== null && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded bg-[#E8E0D0]/10">
            <div
              className="h-full bg-[#c8a26a] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[#E8E0D0]/50">
            {progress < 100 ? `Uploading… ${progress}%` : 'Saving…'}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy || !file}
        className="w-full rounded-md bg-[#E8E0D0] px-6 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Upload song'}
      </button>
    </form>
  );
}
