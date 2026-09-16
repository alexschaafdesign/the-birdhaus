'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import WaveformPlayer, { type TrackControls, type WaveformMarker } from './WaveformPlayer';
import ReactionBar from './ReactionBar';
import MemberAvatar from './MemberAvatar';

// One track: native audio player, uploader credit, and the track's comment
// thread. Comments belong to the TRACK, so the same thread shows wherever the
// track appears (a round, the Singles shelf, its own page). The optional
// audio callbacks let PlaylistTracks pause siblings and auto-advance.
//
// `compact` (list views) collapses the notes + comment thread behind a
// one-line "💬 8 comments · 📝 notes" toggle so a busy round stays scannable —
// title, like button, and the player stay visible. The track's own page
// renders full (default).
//
// `dense` (the event page's cross-group feed) goes further: one-line header
// (avatar · name · title), half-height waveform, no delete control — with an
// optional `contextLabel` tag ("Day 2 · Group B") above. Implies compact.
export default function TrackCard({
  track,
  initialComments,
  viewerMemberId,
  isAdmin,
  compact = false,
  dense = false,
  contextLabel,
  onPlay,
  onEnded,
  registerControls,
  onTrackDeleted,
}: {
  track: ClubTrack;
  initialComments: ClubTrackComment[];
  viewerMemberId: number | null; // null when the viewer is the admin session
  isAdmin: boolean;
  compact?: boolean;
  dense?: boolean;
  contextLabel?: string;
  onPlay?: () => void;
  onEnded?: () => void;
  registerControls?: (controls: TrackControls | null) => void;
  onTrackDeleted?: () => void;
}) {
  // Dense implies compact — the collapse logic below keys off this.
  const collapsed = compact || dense;
  const [comments, setComments] = useState<ClubTrackComment[]>(initialComments);
  const [expanded, setExpanded] = useState(!collapsed);
  const [likes, setLikes] = useState(track.likes);
  const [liking, setLiking] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Pin to the current spot in the track" toggle for the composer.
  const [pinTime, setPinTime] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const canAct = isAdmin || viewerMemberId !== null;
  const canDeleteTrack =
    isAdmin || (viewerMemberId !== null && track.memberId === viewerMemberId);

  // The player's live controls (seek/getCurrentTime) — also forwarded to the
  // parent playlist so it can pause siblings / auto-advance.
  const controlsRef = useRef<TrackControls | null>(null);
  function handleRegister(c: TrackControls | null) {
    controlsRef.current = c;
    registerControls?.(c);
  }

  // Deep links (#track-<id>, or #comment-<id> in this thread) must land on an
  // EXPANDED card — PlaylistTracks opens the day section and scrolls; this
  // opens the card itself.
  useEffect(() => {
    if (!collapsed) return;
    const hash = window.location.hash;
    if (hash === `#track-${track.id}`) setExpanded(true);
    const m = hash.match(/^#comment-(\d+)$/);
    if (m && initialComments.some((c) => c.id === Number(m[1]))) setExpanded(true);
    // Run once on mount — the hash targets the initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const viewerLiked = isAdmin
    ? likes.some((l) => l.memberId === null)
    : viewerMemberId !== null && likes.some((l) => l.memberId === viewerMemberId);

  async function toggleLike() {
    if (!canAct || liking) return;
    setLiking(true);
    setError(null);
    try {
      const res = await fetch(`/api/club/tracks/${track.id}/like`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't like (${res.status})`);
      setLikes(data.likes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't like");
    } finally {
      setLiking(false);
    }
  }

  async function reactToComment(id: number, emoji: string) {
    setError(null);
    try {
      const res = await fetch(`/api/club/comments/${id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Couldn't react (${res.status})`);
      setComments(data.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't react");
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
    <div className={`rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] ${dense ? 'p-3' : 'p-4'}`}>
      {dense && contextLabel && (
        <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#c8a26a]/70">
          {contextLabel}
        </div>
      )}
      <div className="mb-1 flex items-baseline justify-between gap-3">
        {dense ? (
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <MemberAvatar name={track.uploaderName} avatarUrl={track.uploaderAvatarUrl} />
            <span className="truncate">
              <span className="text-[#E8E0D0]/70">{track.uploaderName}</span>
              <span className="text-[#E8E0D0]/40"> · </span>
              <span className="font-medium text-[#E8E0D0]">{track.title}</span>
            </span>
          </div>
        ) : (
        <div className="min-w-0">
          <div className="truncate font-medium text-[#E8E0D0]">{track.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#E8E0D0]/50">
            <MemberAvatar name={track.uploaderName} avatarUrl={track.uploaderAvatarUrl} />
            <span className="truncate">
              {track.uploaderName} · {formatWhen(track.createdAt)}
            </span>
          </div>
        </div>
        )}
        <div className="flex shrink-0 items-center gap-3">
          {(canAct || likes.length > 0) && (
            <button
              type="button"
              onClick={toggleLike}
              disabled={!canAct || liking}
              title={
                likes.length > 0
                  ? `Liked by ${likes.map((l) => l.name).join(', ')}`
                  : 'Like this track'
              }
              aria-label={viewerLiked ? 'Unlike this track' : 'Like this track'}
              className={`flex items-center gap-1 text-sm transition ${
                viewerLiked
                  ? 'text-[#c8a26a]'
                  : 'text-[#E8E0D0]/35 hover:text-[#c8a26a]'
              } ${canAct ? '' : 'cursor-default'}`}
            >
              <span aria-hidden>{viewerLiked ? '♥' : '♡'}</span>
              {likes.length > 0 && (
                <span className="text-xs tabular-nums">{likes.length}</span>
              )}
            </button>
          )}
          {canDeleteTrack && !dense && (
            <button
              type="button"
              onClick={removeTrack}
              className="text-[11px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
            >
              delete track
            </button>
          )}
        </div>
      </div>

      {!collapsed && track.notes && <TrackNotes notes={track.notes} className="mb-2" />}

      {track.peaks && track.peaks.length > 0 ? (
        <WaveformPlayer
          url={track.url}
          peaks={track.peaks}
          durationSeconds={track.durationSeconds}
          markers={markers}
          height={dense ? 36 : 72}
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

      {collapsed && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 flex w-full items-center justify-between border-t border-[#E8E0D0]/10 pt-2.5 text-left text-xs text-[#E8E0D0]/50 transition hover:text-[#E8E0D0]"
        >
          <span>
            {expanded
              ? 'Hide'
              : comments.length > 0
                ? `💬 ${comments.length} ${comments.length === 1 ? 'comment' : 'comments'}`
                : '💬 Be the first to comment'}
            {!expanded && track.notes ? ' · 📝 notes' : ''}
          </span>
          <span aria-hidden>{expanded ? '▾' : '▸'}</span>
        </button>
      )}

      {collapsed && expanded && track.notes && (
        <TrackNotes notes={track.notes} className="mt-2" />
      )}

      {expanded && (
      <div
        className={`mt-3 space-y-2 ${
          // In compact mode the toggle row above already draws the divider.
          collapsed ? 'pt-1' : 'border-t border-[#E8E0D0]/10 pt-3'
        }`}
      >
        {comments.map((c) => {
          const canDelete = isAdmin || (viewerMemberId !== null && c.memberId === viewerMemberId);
          return (
            <div key={c.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2">
                  <MemberAvatar name={c.authorName} avatarUrl={c.avatarUrl} />
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
                      className="rounded bg-[#c8a26a]/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#c8a26a] transition hover:bg-[#c8a26a]/25"
                    >
                      {fmtTime(c.timestampSeconds)}
                    </button>
                  )}
                </span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="text-[11px] text-[#E8E0D0]/35">{formatWhen(c.createdAt)}</span>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => removeComment(c.id)}
                      className="text-[11px] text-[#E8E0D0]/35 transition hover:text-[#F5A3A3]"
                    >
                      delete
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[#E8E0D0]/80">{c.body}</p>
              <ReactionBar
                reactions={c.reactions}
                viewerMemberId={viewerMemberId}
                isAdmin={isAdmin}
                canReact={canAct}
                onToggle={(emoji) => reactToComment(c.id, emoji)}
              />
            </div>
          );
        })}

        {error && (
          <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
            {error}
          </div>
        )}

        {!canAct ? (
          <Link
            href="/song-club/login"
            className="inline-block text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
          >
            Log in to comment
          </Link>
        ) : (
        <div className="flex items-center gap-2 pt-1">
          {track.peaks && track.peaks.length > 0 && (
            <button
              type="button"
              onClick={() => setPinTime((v) => !v)}
              title="Attach this comment to the current spot in the track"
              className={`flex shrink-0 items-center gap-1 rounded border px-2 py-1.5 font-mono text-xs tabular-nums transition ${
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
        )}
      </div>
      )}
    </div>
  );
}

// Uploader notes, clamped to a preview when long (full lyrics get pasted
// here) with a Show more toggle — one level deeper than the card's own
// comments/notes collapse. Short notes render in full, no toggle.
function TrackNotes({ notes, className }: { notes: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = notes.split('\n').length > 7 || notes.length > 600;
  if (!long) {
    return (
      <p className={`whitespace-pre-wrap text-sm text-[#E8E0D0]/70 ${className ?? ''}`}>{notes}</p>
    );
  }
  return (
    <div className={className}>
      <p
        className={`whitespace-pre-wrap text-sm text-[#E8E0D0]/70 ${open ? '' : 'line-clamp-6'}`}
      >
        {notes}
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-xs font-medium text-[#c8a26a]/80 transition hover:text-[#c8a26a]"
      >
        {open ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Club home timezone, NOT the runtime's: the server renders in UTC and the
  // viewer hydrates in their own zone — an evening timestamp would produce
  // different text and a hydration mismatch (React #418).
  return d
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Chicago',
    })
    .replace(' AM', ' am')
    .replace(' PM', ' pm');
}

function fmtTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
