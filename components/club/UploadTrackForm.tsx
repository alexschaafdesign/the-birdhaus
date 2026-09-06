'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// Three-step upload: ask the API for a presigned URL, PUT the audio straight
// to R2 (XHR, for upload progress — the file never touches Vercel), then
// register the uploaded key as a track. Lands on the round (or the track's
// page for a single) when done.
export default function UploadTrackForm({
  playlists,
  defaultPlaylistId,
}: {
  playlists: Array<{ id: number; title: string }>;
  defaultPlaylistId?: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [playlistId, setPlaylistId] = useState<string>(
    defaultPlaylistId ? String(defaultPlaylistId) : ''
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <p className="mt-1 text-[11px] text-[#E8E0D0]/40">
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

      <div>
        <label htmlFor="track-playlist" className={labelClass}>
          Add to a round
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

      {progress !== null && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded bg-[#E8E0D0]/10">
            <div
              className="h-full bg-[#c8a26a] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-[#E8E0D0]/50">
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
        {busy ? 'Uploading…' : 'Upload track'}
      </button>
    </form>
  );
}
