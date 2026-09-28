'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LyricsRevision } from '@/lib/band-lyrics';

// The song's living lyrics document: current text with edit-in-place, plus a
// history browser. Every save is an append-only revision (see lib/band-lyrics);
// picking a revision in history shows a line diff against the one before it.

type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

// Classic LCS line diff — lyrics are a few hundred lines at most, so the
// quadratic table is nothing.
function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText === '' ? [] : oldText.split('\n');
  const b = newText === '' ? [] : newText.split('\n');
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      out.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) out.push({ kind: 'removed', text: a[i++] });
  while (j < n) out.push({ kind: 'added', text: b[j++] });
  return out;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

export default function BandLyrics({
  songId,
  revisions,
}: {
  songId: number;
  // Newest first — [0] is the current lyrics.
  revisions: LyricsRevision[];
}) {
  const router = useRouter();
  const current = revisions[0] ?? null;
  const hasLyrics = Boolean(current && current.body.trim());

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/songs/${songId}/lyrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't save (${res.status})`);
      }
      setEditing(false);
      setHistoryOpen(false);
      setSelectedId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  // Removing a bad revision from history: the one below it becomes the diff
  // base, and if it was the latest, the previous revision is current again.
  async function deleteRevision(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ostrich/lyrics/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      }
      if (selectedId === id) setSelectedId(null);
      setConfirmDeleteId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  const selectedIdx = selectedId === null ? -1 : revisions.findIndex((r) => r.id === selectedId);
  const selected = selectedIdx === -1 ? null : revisions[selectedIdx];
  const selectedPrev = selectedIdx === -1 ? null : revisions[selectedIdx + 1] ?? null;

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
          Lyrics
        </span>
        {!editing && (
          <div className="flex shrink-0 items-center gap-3 text-xs">
            {revisions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  setSelectedId(null);
                }}
                className={`underline-offset-2 transition hover:underline ${
                  historyOpen ? 'text-[#c8a26a]' : 'text-[#E8E0D0]/45 hover:text-[#E8E0D0]'
                }`}
              >
                history ({revisions.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setDraft(current?.body ?? '');
                setEditing(true);
                setHistoryOpen(false);
                setSelectedId(null);
              }}
              className="text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              {hasLyrics ? 'edit' : '+ add lyrics'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(10, draft.split('\n').length + 2)}
            autoFocus
            placeholder={'Verse 1…'}
            className="w-full resize-y rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm leading-relaxed text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => save(draft)}
              className="rounded-md bg-[#E8E0D0] px-4 py-1.5 text-xs font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-2 text-xs text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
            >
              Cancel
            </button>
            <span className="ml-auto self-center text-[11px] text-[#E8E0D0]/35">
              every save keeps the old text in history
            </span>
          </div>
        </div>
      ) : historyOpen ? (
        <div className="space-y-3">
          <div className="space-y-1">
            {revisions.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
                  selectedId === r.id
                    ? 'border-[#c8a26a]/60 bg-[#c8a26a]/10'
                    : 'border-[#E8E0D0]/10 hover:border-[#E8E0D0]/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <span className="text-[#E8E0D0]/80">
                    {fmtWhen(r.createdAt)}
                    <span className="ml-2 text-[#E8E0D0]/45">{r.editorName}</span>
                    {i === 0 && <span className="ml-2 text-[#c8a26a]">current</span>}
                  </span>
                  {r.versionLabels.length > 0 && (
                    <span
                      className="max-w-[45%] truncate text-[#c8a26a]/80"
                      title={`As recorded on: ${r.versionLabels.join(', ')}`}
                    >
                      ♪ {r.versionLabels.join(', ')}
                    </span>
                  )}
                </button>
                {confirmDeleteId === r.id ? (
                  <span className="shrink-0 text-[#F5A3A3]">
                    delete{r.versionLabels.length > 0 ? ' (unpins ♪)' : ''}?{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteRevision(r.id)}
                      className="font-semibold underline underline-offset-2 disabled:opacity-50"
                    >
                      yes
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-[#E8E0D0]/45"
                    >
                      no
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(r.id)}
                    title="Delete this revision from history"
                    className="shrink-0 px-1 text-[#E8E0D0]/30 transition hover:text-[#F5A3A3]"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          {selected && (
            <div className="rounded-md border border-[#E8E0D0]/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-[#E8E0D0]/45">
                <span>
                  {selectedPrev
                    ? 'changes vs the previous revision'
                    : 'first revision'}
                </span>
                {selectedIdx !== 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => save(selected.body)}
                    className="text-[#c8a26a] underline-offset-2 transition hover:underline disabled:opacity-50"
                  >
                    restore this revision
                  </button>
                )}
              </div>
              <div className="text-sm leading-relaxed">
                {diffLines(selectedPrev?.body ?? '', selected.body).map((line, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap px-1 ${
                      line.kind === 'added'
                        ? 'bg-[#c8a26a]/15 text-[#c8a26a]'
                        : line.kind === 'removed'
                          ? 'bg-[#F5A3A3]/10 text-[#F5A3A3]/70 line-through'
                          : 'text-[#E8E0D0]/80'
                    }`}
                  >
                    {line.text || ' '}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : hasLyrics ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#E8E0D0]/85">
          {current!.body}
        </p>
      ) : (
        <p className="text-sm text-[#E8E0D0]/40">
          No lyrics yet — every recording from here on will remember the words
          it was made with.
        </p>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}
    </div>
  );
}
