'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { prepareAudioForUpload } from '@/lib/audio-transcode';
import {
  BAND_SONG_STATUSES,
  BAND_SONG_STATUS_LABEL,
  type BandSongStatus,
} from '@/lib/band-constants';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';
const chipBase = 'rounded-full border px-3 py-1 text-xs transition';
const chipOff = `${chipBase} border-[#E8E0D0]/20 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/40`;
const chipOn = `${chipBase} border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]`;

// Same accepted set as the presign route's extension fallback.
const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'wav', 'aif', 'aiff', 'flac', 'ogg', 'oga', 'opus',
]);

// The presign route allows 150 uploads/hr per actor; keep a batch inside it.
const MAX_BATCH = 150;
const CONCURRENCY = 3;

// "03_golden hour v2.mp3" → "golden hour v2". Conservative on purpose: strip
// the extension and a leading track number, turn underscores into spaces —
// but never touch hyphens or casing, those are usually part of the title.
// Everything is editable in the review table anyway.
function deriveTitle(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const title = base
    .replace(/^\d{1,3}[\s._-]+(?=\S)/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return title || base.trim().slice(0, 200) || 'Untitled';
}

type ItemState =
  | { phase: 'ready' }
  | { phase: 'working'; step: 'preparing' | 'saving'; progress?: undefined }
  | { phase: 'working'; step: 'uploading'; progress: number }
  | { phase: 'done'; songId: number }
  | { phase: 'error'; message: string };

interface ImportItem {
  key: number;
  file: File;
  title: string;
  state: ItemState;
  // Set the moment the song row exists, so a retry after a failed version
  // registration attaches to the same song instead of creating a duplicate.
  songId: number | null;
}

// Recursively collect files from a drop that may contain folders. The
// webkitGetAsEntry calls must all happen before the first await — the
// DataTransferItemList is dead once the event loop turns.
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));
  if (entries.length === 0) return Array.from(dt.files);
  const out: File[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject)
      ).catch(() => null);
      if (file) out.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries hands back batches of ≤100; keep draining until empty.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject)
        ).catch(() => [] as FileSystemEntry[]);
        if (batch.length === 0) break;
        for (const child of batch) await walk(child);
      }
    }
  }
  for (const entry of entries) await walk(entry);
  return out;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Bulk import: drop a folder (or pick files), review the filename-derived
// titles, set a status + tags for the whole batch, then run each file through
// the standard three-step upload (presign → PUT to R2 → register) plus a
// song-create in between. The song row is only created AFTER its audio lands
// in R2, so a failed upload never leaves an empty song in the pile.
export default function BandBulkImport({
  allTags,
  existingTitles,
  workspace,
}: {
  allTags: string[];
  existingTitles: string[];
  workspace: { id: number; slug: string };
}) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [status, setStatus] = useState<BandSongStatus>('demo');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [skippedNote, setSkippedNote] = useState<string | null>(null);
  const nextKey = useRef(1);
  // The workers read title/songId at run time through this ref — reading the
  // `items` closure would hand them a stale snapshot.
  const itemsRef = useRef<ImportItem[]>(items);
  itemsRef.current = items;

  const existingLower = useRef(new Set(existingTitles.map((t) => t.trim().toLowerCase())));

  function addFiles(files: File[]) {
    setSkippedNote(null);
    const current = itemsRef.current;
    const seen = new Set(current.map((it) => `${it.file.name}:${it.file.size}`));
    const fresh: ImportItem[] = [];
    let skipped = 0;
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      // .DS_Store, AppleDouble "._" siblings, and anything non-audio.
      if (file.name.startsWith('.') || !AUDIO_EXTENSIONS.has(ext)) {
        skipped++;
        continue;
      }
      const id = `${file.name}:${file.size}`;
      if (seen.has(id)) continue;
      seen.add(id);
      fresh.push({
        key: nextKey.current++,
        file,
        title: deriveTitle(file.name),
        state: { phase: 'ready' },
        songId: null,
      });
    }
    let batch = [...current, ...fresh];
    const over = batch.length - MAX_BATCH;
    if (over > 0) batch = batch.slice(0, MAX_BATCH);
    setItems(batch);
    const notes: string[] = [];
    if (skipped > 0) notes.push(`${skipped} non-audio file${skipped === 1 ? '' : 's'} skipped`);
    if (over > 0) notes.push(`batches are capped at ${MAX_BATCH} files — ${over} left off`);
    if (notes.length > 0) setSkippedNote(notes.join('; '));
  }

  function setItem(key: number, patch: Partial<ImportItem>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  function addTagDraft() {
    const tag = tagDraft.trim().toLowerCase().slice(0, 40);
    if (tag && !tags.includes(tag)) setTags((prev) => [...prev, tag]);
    setTagDraft('');
  }

  function putWithProgress(url: string, body: File, contentType: string, key: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable)
          setItem(key, {
            state: { phase: 'working', step: 'uploading', progress: Math.round((e.loaded / e.total) * 100) },
          });
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
      xhr.send(body);
    });
  }

  async function importOne(key: number): Promise<void> {
    const item = itemsRef.current.find((it) => it.key === key);
    if (!item || item.state.phase === 'done') return;
    try {
      setItem(key, { state: { phase: 'working', step: 'preparing' } });
      const { uploadFile, peaks, durationSeconds } = await prepareAudioForUpload(item.file);

      const urlRes = await fetch('/api/ostrich/versions/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadFile.name,
          contentType: uploadFile.type,
          sizeBytes: uploadFile.size,
        }),
      });
      const urlData = await urlRes.json().catch(() => null);
      if (!urlRes.ok) throw new Error(urlData?.error ?? `Couldn't start upload (${urlRes.status})`);

      setItem(key, { state: { phase: 'working', step: 'uploading', progress: 0 } });
      await putWithProgress(urlData.uploadUrl, uploadFile, urlData.contentType, key);

      setItem(key, { state: { phase: 'working', step: 'saving' } });
      let songId = itemsRef.current.find((it) => it.key === key)?.songId ?? null;
      if (songId === null) {
        const songRes = await fetch('/api/ostrich/songs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: item.title, status, tags, workspaceId: workspace.id }),
        });
        const songData = await songRes.json().catch(() => null);
        if (!songRes.ok) throw new Error(songData?.error ?? `Couldn't create song (${songRes.status})`);
        songId = Number(songData.song.id);
        setItem(key, { songId });
      }

      const versionRes = await fetch(`/api/ostrich/songs/${songId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: urlData.key,
          uploadToken: urlData.uploadToken,
          // Label the version with the original filename — provenance for
          // "which bounce was this" once the title has drifted.
          label: item.file.name.replace(/\.[^.]+$/, '') || item.title,
          contentType: urlData.contentType,
          peaks,
          durationSeconds,
        }),
      });
      const versionData = await versionRes.json().catch(() => null);
      if (!versionRes.ok)
        throw new Error(versionData?.error ?? `Couldn't save (${versionRes.status})`);

      setItem(key, { state: { phase: 'done', songId } });
    } catch (err) {
      setItem(key, {
        state: { phase: 'error', message: err instanceof Error ? err.message : 'Upload failed' },
      });
    }
  }

  async function runImport() {
    setImporting(true);
    const queue = itemsRef.current
      .filter((it) => it.state.phase !== 'done')
      .map((it) => it.key);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (;;) {
          const mine = next++;
          if (mine >= queue.length) return;
          await importOne(queue[mine]);
        }
      })
    );
    setImporting(false);
  }

  const doneCount = items.filter((it) => it.state.phase === 'done').length;
  const errorCount = items.filter((it) => it.state.phase === 'error').length;
  const allDone = items.length > 0 && doneCount === items.length;
  const started = items.some((it) => it.state.phase !== 'ready');
  const batchTitleCounts = new Map<string, number>();
  for (const it of items) {
    const t = it.title.trim().toLowerCase();
    batchTitleCounts.set(t, (batchTitleCounts.get(t) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      {!allDone && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!importing) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            if (importing) return;
            addFiles(await filesFromDrop(e.dataTransfer));
          }}
          className={`rounded-lg border border-dashed p-6 text-center transition ${
            dragging
              ? 'border-[#c8a26a] bg-[#c8a26a]/10'
              : 'border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.03]'
          }`}
        >
          <p className="text-sm text-[#E8E0D0]/70">
            Drop audio files or a whole folder here
          </p>
          <p className="mt-1 text-[11px] text-[#E8E0D0]/40">
            mp3, m4a, wav, aiff, flac, or ogg — up to 250 MB each. One song per file.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <label className="cursor-pointer rounded-md border border-[#E8E0D0]/25 px-4 py-2 text-sm text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]">
              Browse files
              <input
                type="file"
                multiple
                accept="audio/*,.mp3,.m4a,.wav,.aif,.aiff,.flac,.ogg,.opus"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </label>
            <label className="cursor-pointer rounded-md border border-[#E8E0D0]/25 px-4 py-2 text-sm text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/50 hover:text-[#E8E0D0]">
              Choose a folder
              <input
                type="file"
                multiple
                className="hidden"
                disabled={importing}
                {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}

      {skippedNote && <p className="text-xs text-[#E8E0D0]/45">{skippedNote}</p>}

      {items.length > 0 && !started && (
        <div className="space-y-4 rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
          <div>
            <label htmlFor="import-status" className={labelClass}>
              Status for all {items.length}
            </label>
            <select
              id="import-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BandSongStatus)}
              className="rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] transition focus:border-[#E8E0D0]/50 focus:outline-none"
            >
              {BAND_SONG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {BAND_SONG_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className={labelClass}>Tags for all (optional)</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[...new Set([...allTags, ...tags])].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={tags.includes(tag) ? chipOn : chipOff}
                >
                  {tag}
                </button>
              ))}
              <input
                type="text"
                value={tagDraft}
                placeholder="new tag…"
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTagDraft();
                  }
                }}
                onBlur={addTagDraft}
                className={`${inputBase} w-32`}
              />
            </div>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => {
            const titleLower = it.title.trim().toLowerCase();
            const dup =
              existingLower.current.has(titleLower) ||
              (batchTitleCounts.get(titleLower) ?? 0) > 1;
            return (
              <div
                key={it.key}
                className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {it.state.phase === 'done' ? (
                      <Link
                        href={`/w/${workspace.slug}/songs/${it.state.songId}`}
                        className="text-sm font-semibold text-[#E8E0D0] underline-offset-2 hover:underline"
                      >
                        {it.title}
                      </Link>
                    ) : (
                      <input
                        type="text"
                        value={it.title}
                        disabled={importing || it.state.phase === 'working'}
                        onChange={(e) => setItem(it.key, { title: e.target.value })}
                        aria-label={`Title for ${it.file.name}`}
                        className={inputBase}
                      />
                    )}
                    <p className="mt-1 truncate text-[11px] text-[#E8E0D0]/40">
                      {it.file.name} · {fmtSize(it.file.size)}
                      {dup && it.state.phase !== 'done' && (
                        <span className="ml-2 text-[#c8a26a]">already a song with this title</span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {it.state.phase === 'ready' && !importing && (
                      <button
                        type="button"
                        onClick={() => setItems((prev) => prev.filter((p) => p.key !== it.key))}
                        className="text-[#E8E0D0]/40 transition hover:text-[#F5A3A3]"
                      >
                        remove
                      </button>
                    )}
                    {it.state.phase === 'working' && (
                      <span className="text-[#E8E0D0]/55">
                        {it.state.step === 'uploading'
                          ? `${it.state.progress}%`
                          : `${it.state.step}…`}
                      </span>
                    )}
                    {it.state.phase === 'done' && <span className="text-[#c8a26a]">added ✓</span>}
                    {it.state.phase === 'error' && (
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() => importOne(it.key)}
                        className="text-[#F5A3A3] underline-offset-2 hover:underline disabled:opacity-50"
                      >
                        retry
                      </button>
                    )}
                  </div>
                </div>
                {it.state.phase === 'working' && it.state.step === 'uploading' && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-[#E8E0D0]/10">
                    <div
                      className="h-full bg-[#c8a26a] transition-[width]"
                      style={{ width: `${it.state.progress}%` }}
                    />
                  </div>
                )}
                {it.state.phase === 'error' && (
                  <p className="mt-2 text-xs text-[#F5A3A3]">{it.state.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && !allDone && (
        <button
          type="button"
          disabled={importing || items.every((it) => it.state.phase === 'done')}
          onClick={runImport}
          className="w-full rounded-md bg-[#E8E0D0] px-6 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing
            ? `Importing… ${doneCount}/${items.length}`
            : errorCount > 0
              ? `Retry ${errorCount} failed`
              : `Import ${items.length} ${items.length === 1 ? 'song' : 'songs'}`}
        </button>
      )}

      {allDone && (
        <div className="rounded-lg border border-[#c8a26a]/40 bg-[#c8a26a]/10 p-4 text-sm text-[#E8E0D0]">
          All {items.length} {items.length === 1 ? 'song' : 'songs'} added.{' '}
          <Link
            href={`/w/${workspace.slug}`}
            className="text-[#c8a26a] underline-offset-2 hover:underline"
          >
            Back to the song pile
          </Link>
        </div>
      )}
    </div>
  );
}
