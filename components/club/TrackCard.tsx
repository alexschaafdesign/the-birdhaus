'use client';

import { useRef, useState } from 'react';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import WaveformPlayer, { type TrackControls, type WaveformMarker } from './WaveformPlayer';

// One track: native audio player, uploader credit, and the track's comment
// thread. Comments belong to the TRACK, so the same thread shows wherever the
// track appears (a round, the Singles shelf, its own page). The optional
// audio callbacks let PlaylistTracks pause siblings and auto-advance.
export default function TrackCard({
  track,
  initialComments,
  viewerMemberId,
  isAdmin,
  onPlay,
  onEnded,
  registerControls,
  onTrackDeleted,
}: {
  track: ClubTrack;
  initialComments: ClubTrackComment[];
  viewerMemberId: number | null; // null when the viewer is the admin session
  isAdmin: boolean;
  onPlay?: () => void;
  onEnded?: () => void;
  registerControls?: (controls: TrackControls | null) => void;
  onTrackDeleted?: () => void;
}) {
  const [comments, setComments] = useState<ClubTrackComment[]>(initialComments);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Pin to the current spot in the track" toggle for the composer.
  const [pinTime, setPinTime] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const canDeleteTrack =
    isAdmin || (viewerMemberId !== null && track.memberId === viewerMemberId);

  // The player's live controls (seek/getCurrentTime) — also forwarded to the
  // parent playlist so it can pause siblings / auto-advance.
  const controlsRef = useRef<TrackControls | null>(null);
  function handleRegister(c: TrackControls | null) {
    controlsRef.current = c;
    registerControls?.(c);
  }

  // Comments with a timestamp become avatar markers on the waveform.
  const markers: WaveformMarker[] = comments
    .filter((c) => c.timestampSeconds !== null)
    .map((c) => ({
      id: c.id,
      timestampSeconds: c.timestampSeconds as number,
      authorName: c.authorName,
      avatarUrl: c.avatarUrl,
      body: c.body,
    }));

  async function comment() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    const timestampSeconds = pinTime
      ? Math.floor(controlsRef.current?.getCurrentTime() ?? playhead)
      : null;
    try {
      const res = await fetch(`/api/club/tracks/${track.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, timestampSeconds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't comment (${res.status})`);
      setComments(data.comments ?? []);
      setDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't comment");
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(id: number) {
    setError(null);
    try {
      const res = await fetch(`/api/club/comments/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      setComments(data.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  async function removeTrack() {
    if (!confirm(`Delete "${track.title}"? Its comments go with it.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/club/tracks/${track.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't delete (${res.status})`);
      onTrackDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium text-[#E8E0D0]">{track.title}</div>
          <div className="mt-0.5 text-xs text-[#E8E0D0]/50">
            {track.uploaderName} · {formatWhen(track.createdAt)}
          </div>
        </div>
        {canDeleteTrack && (
          <button
            type="button"
            onClick={removeTrack}
            className="shrink-0 text-[10px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
          >
            delete track
          </button>
        )}
      </div>

      {track.notes && (
        <p className="mb-2 whitespace-pre-wrap text-sm text-[#E8E0D0]/70">{track.notes}</p>
      )}

      {track.peaks && track.peaks.length > 0 ? (
        <WaveformPlayer
          url={track.url}
          peaks={track.peaks}
          durationSeconds={track.durationSeconds}
          markers={markers}
          onPlay={onPlay}
          onEnded={onEnded}
          onTimeSecond={setPlayhead}
          registerControls={handleRegister}
        />
      ) : (
        // Tracks uploaded before waveforms existed (or whose decode failed)
        // fall back to the native player.
        <audio src={track.url} controls preload="none" className="mt-1 w-full" />
      )}

      <div className="mt-3 space-y-2 border-t border-[#E8E0D0]/10 pt-3">
        {comments.map((c) => {
          const canDelete = isAdmin || (viewerMemberId !== null && c.memberId === viewerMemberId);
          return (
            <div key={c.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-baseline gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      c.fromAdmin ? 'text-[#c8a26a]' : 'text-[#E8E0D0]'
                    }`}
                  >
                    {c.authorName}
                  </span>
                  {c.timestampSeconds !== null && (
                    <button
                      type="button"
                      onClick={() => controlsRef.current?.seek(c.timestampSeconds as number)}
                      className="rounded bg-[#c8a26a]/15 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[#c8a26a] transition hover:bg-[#c8a26a]/25"
                    >
                      {fmtTime(c.timestampSeconds)}
                    </button>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-[10px] text-[#E8E0D0]/35">{formatWhen(c.createdAt)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => removeComment(c.id)}
                      className="text-[10px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                    >
                      delete
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[#E8E0D0]/80">{c.body}</p>
            </div>
          );
        })}

        {error && (
          <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {track.peaks && track.peaks.length > 0 && (
            <button
              type="button"
              onClick={() => setPinTime((v) => !v)}
              title="Attach this comment to the current spot in the track"
              className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1.5 font-mono text-[11px] tabular-nums transition ${
                pinTime
                  ? 'border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]'
                  : 'border-[#E8E0D0]/20 text-[#E8E0D0]/45 hover:text-[#E8E0D0]'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {pinTime ? fmtTime(Math.floor(playhead)) : 'at…'}
            </button>
          )}
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') comment();
            }}
            placeholder={
              pinTime
                ? `Comment at ${fmtTime(Math.floor(playhead))}…`
                : comments.length === 0
                  ? 'Be the first to comment…'
                  : 'Add a comment…'
            }
            className="w-full rounded border border-[#E8E0D0]/20 bg-transparent px-3 py-1.5 text-sm placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={comment}
            disabled={busy || !draft.trim()}
            className="shrink-0 rounded border border-[#E8E0D0]/40 px-3 py-1.5 text-sm text-[#E8E0D0]/80 transition hover:border-[#E8E0D0] hover:text-[#E8E0D0] disabled:opacity-40"
          >
            {busy ? '…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
