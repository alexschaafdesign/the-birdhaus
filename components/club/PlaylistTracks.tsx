'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClubTrack, ClubTrackComment } from '@/lib/club-music';
import type { DaysOpenDefault } from '@/lib/song-club';
import TrackCard from './TrackCard';
import type { TrackControls } from './WaveformPlayer';

// Parse "YYYY-MM-DD" as LOCAL midnight — a bare date string would parse as
// UTC midnight and render the previous day in Central time.
function localDate(day: string): Date {
  return new Date(day + 'T00:00:00');
}

// The calendar day before "YYYY-MM-DD", as "YYYY-MM-DD".
function previousDay(day: string): string {
  const d = localDate(day);
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA');
}

function dayLabel(day: string, eventStartDate: string | null | undefined): string {
  const date = localDate(day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (!eventStartDate) return date;
  const n =
    Math.round((localDate(day).getTime() - localDate(eventStartDate).getTime()) / 86400000) + 1;
  return n >= 1 ? `Day ${n} — ${date}` : date;
}

// Sorts undated tracks after every dated one.
const UNDATED = '9999-99-99';

// A round's track list. Plays like a record: starting one track pauses the
// others, and when a track ends the next one starts. Admin gets reorder
// (up/down), remove-from-round, and highlight-star controls per track.
//
// groupByDay renders song-a-day style: tracks under Day headers in date order
// (undated last). When `today` (from getTodayCentral) + `storageKey` are also
// given, the day sections COLLAPSE: days that haven't happened yet aren't
// rendered at all, the event's days_open_default decides which past days start
// open, and each viewer's own toggles live in sessionStorage — never the DB.
// Old flat rounds pass none of this and render exactly as before.
export default function PlaylistTracks({
  playlistId,
  initialTracks,
  commentsByTrack,
  viewerMemberId,
  isAdmin,
  groupByDay = false,
  eventStartDate = null,
  eventEndDate = null,
  today = null,
  daysOpenDefault = 'current',
  storageKey = null,
  allowReorder = true,
}: {
  playlistId: number;
  initialTracks: ClubTrack[];
  commentsByTrack: Record<number, ClubTrackComment[]>;
  viewerMemberId: number | null;
  isAdmin: boolean;
  groupByDay?: boolean;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  // "YYYY-MM-DD" in Central time, computed server-side (getTodayCentral).
  today?: string | null;
  daysOpenDefault?: DaysOpenDefault;
  // sessionStorage key for this list's per-viewer toggles — key it by event
  // AND group so Group A and Group B don't share state.
  storageKey?: string | null;
  // Off for SUBSET views of a round (Highlights, Unassigned): reordering a
  // subset would rewrite the full round's positions from partial data.
  allowReorder?: boolean;
}) {
  const router = useRouter();
  const [tracks, setTracks] = useState<ClubTrack[]>(initialTracks);
  const [error, setError] = useState<string | null>(null);
  // Per-viewer expand/collapse choices, on top of the admin default.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const controlsRef = useRef<Map<number, TrackControls>>(new Map());

  const collapsible = groupByDay && !!today && !!eventStartDate && !!storageKey;
  const storageId = `sc-days:${storageKey ?? ''}`;

  // The day "in focus": today clamped into the event's range — before the
  // event that's Day 1, after it it's the last day.
  const focusDay = useMemo(() => {
    if (!collapsible) return null;
    const last = eventEndDate ?? eventStartDate!;
    return today! < eventStartDate! ? eventStartDate! : today! > last ? last : today!;
  }, [collapsible, today, eventStartDate, eventEndDate]);

  // Render (and auto-advance) order: day ascending with undated last when
  // grouping; the round's own position order otherwise. Days after the focus
  // day haven't happened — they don't render at all.
  const ordered = useMemo(() => {
    if (!groupByDay) return tracks;
    const shown = focusDay ? tracks.filter((t) => !t.day || t.day <= focusDay) : tracks;
    return [...shown].sort((a, b) =>
      (a.day ?? UNDATED) < (b.day ?? UNDATED) ? -1 : (a.day ?? UNDATED) > (b.day ?? UNDATED) ? 1 : 0
    );
  }, [tracks, groupByDay, focusDay]);

  const sections = useMemo(() => {
    if (!groupByDay) return null;
    const out: Array<{ day: string | null; tracks: ClubTrack[] }> = [];
    for (const t of ordered) {
      const last = out[out.length - 1];
      if (last && last.day === (t.day ?? null)) last.tracks.push(t);
      else out.push({ day: t.day ?? null, tracks: [t] });
    }
    return out;
  }, [groupByDay, ordered]);

  function defaultOpen(day: string | null): boolean {
    if (!collapsible || day === null) return true; // undated: always start open
    if (daysOpenDefault === 'all') return day <= focusDay!;
    if (daysOpenDefault === 'current_and_previous') {
      return day === focusDay || day === previousDay(focusDay!);
    }
    return day === focusDay;
  }

  function isOpen(day: string | null): boolean {
    if (!collapsible) return true;
    const key = day ?? 'none';
    return overrides[key] ?? defaultOpen(day);
  }

  function toggleDay(day: string | null) {
    if (!collapsible) return;
    const key = day ?? 'none';
    setOverrides((prev) => {
      const next = { ...prev, [key]: !(prev[key] ?? defaultOpen(day)) };
      try {
        sessionStorage.setItem(storageId, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  // Restore this viewer's toggles for the session (their place mid-catch-up
  // survives a refresh; nothing is ever written to the DB).
  useEffect(() => {
    if (!collapsible) return;
    try {
      const stored = sessionStorage.getItem(storageId);
      if (stored) setOverrides(JSON.parse(stored));
    } catch {}
  }, [collapsible, storageId]);

  // Deep links: #track-<id> (or #comment-<id> on one of these tracks) must
  // open its collapsed day and scroll there — a link shared in a group board
  // can't land on a section with nothing visible.
  useEffect(() => {
    const hash = window.location.hash;
    const trackMatch = hash.match(/^#track-(\d+)$/);
    const commentMatch = hash.match(/^#comment-(\d+)$/);
    let trackId: number | null = trackMatch ? Number(trackMatch[1]) : null;
    if (commentMatch) {
      const commentId = Number(commentMatch[1]);
      for (const [tid, list] of Object.entries(commentsByTrack)) {
        if (list.some((c) => c.id === commentId)) trackId = Number(tid);
      }
    }
    if (trackId === null) return;
    const track = initialTracks.find((t) => t.id === trackId);
    if (!track) return;
    if (collapsible && !isOpen(track.day ?? null)) {
      const key = track.day ?? 'none';
      setOverrides((prev) => ({ ...prev, [key]: true }));
    }
    const timer = setTimeout(() => {
      document.getElementById(`track-${trackId}`)?.scrollIntoView({ block: 'start' });
    }, 150);
    return () => clearTimeout(timer);
    // Run once on mount — the hash targets the initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setControls(trackId: number, controls: TrackControls | null) {
    if (controls) controlsRef.current.set(trackId, controls);
    else controlsRef.current.delete(trackId);
  }

  function pauseOthers(trackId: number) {
    for (const [id, c] of controlsRef.current) {
      if (id !== trackId) c.pause();
    }
  }

  function playNext(trackId: number) {
    const index = ordered.findIndex((t) => t.id === trackId);
    const next = index >= 0 ? ordered[index + 1] : undefined;
    if (next) controlsRef.current.get(next.id)?.play();
  }

  async function patch(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/club/playlists/${playlistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Couldn't update (${res.status})`);
      return false;
    }
    return true;
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    if (await patch({ reorder: next.map((t) => t.id) })) setTracks(next);
  }

  async function removeFromRound(trackId: number) {
    if (await patch({ removeTrackId: trackId })) {
      setTracks(tracks.filter((t) => t.id !== trackId));
    }
  }

  async function toggleHighlight(track: ClubTrack) {
    if (await patch({ highlightTrackId: track.id, isHighlight: !track.isHighlight })) {
      setTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, isHighlight: !track.isHighlight } : t))
      );
      router.refresh();
    }
  }

  function trackRow(track: ClubTrack, flatIndex: number) {
    return (
      // The anchor id only exists in day-grouped mode (deep links into
      // collapsed days) — flat rounds render exactly as they always have.
      <div key={track.id} id={groupByDay ? `track-${track.id}` : undefined}>
        {isAdmin && (
          <div className="mb-1 flex items-center justify-end gap-2 text-[10px] text-[#E8E0D0]/40">
            <button
              type="button"
              onClick={() => toggleHighlight(track)}
              className={`transition ${
                track.isHighlight ? 'text-[#c8a26a]' : 'hover:text-[#c8a26a]'
              }`}
              title={track.isHighlight ? 'Remove from Highlights' : 'Add to Highlights'}
            >
              {track.isHighlight ? '★ highlighted' : '☆ highlight'}
            </button>
            {!groupByDay && allowReorder && (
              <>
                <button
                  type="button"
                  onClick={() => move(flatIndex, -1)}
                  disabled={flatIndex === 0}
                  className="transition hover:text-[#E8E0D0] disabled:opacity-30"
                >
                  ↑ up
                </button>
                <button
                  type="button"
                  onClick={() => move(flatIndex, 1)}
                  disabled={flatIndex === tracks.length - 1}
                  className="transition hover:text-[#E8E0D0] disabled:opacity-30"
                >
                  ↓ down
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => removeFromRound(track.id)}
              className="transition hover:text-[#F5A3A3]"
            >
              remove from round
            </button>
          </div>
        )}
        <TrackCard
          track={track}
          initialComments={commentsByTrack[track.id] ?? []}
          viewerMemberId={viewerMemberId}
          isAdmin={isAdmin}
          registerControls={(c) => setControls(track.id, c)}
          onPlay={() => pauseOthers(track.id)}
          onEnded={() => playNext(track.id)}
          onTrackDeleted={() => {
            setTracks((prev) => prev.filter((t) => t.id !== track.id));
            router.refresh();
          }}
        />
      </div>
    );
  }

  if (tracks.length === 0 || (sections && sections.length === 0)) {
    return (
      <p className="text-sm text-[#E8E0D0]/40">
        No tracks in this round yet — be the first to upload one.
      </p>
    );
  }

  const headerClass =
    'mb-2 mt-6 w-full border-b border-[#E8E0D0]/10 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-[#c8a26a]/80 first:mt-0';

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm text-red-200">
          {error}
        </div>
      )}
      {!sections
        ? tracks.map((track, i) => trackRow(track, i))
        : sections.map((section) => {
            const label = section.day ? dayLabel(section.day, eventStartDate) : 'No day';
            const open = isOpen(section.day);
            const count = section.tracks.length;
            return (
              <div key={section.day ?? 'none'}>
                {collapsible ? (
                  <button
                    type="button"
                    onClick={() => toggleDay(section.day)}
                    aria-expanded={open}
                    className={`${headerClass} transition hover:text-[#c8a26a]`}
                  >
                    <span aria-hidden className="mr-1.5 inline-block w-3">
                      {open ? '▾' : '▸'}
                    </span>
                    {label}
                    {!open && (
                      <span className="text-[#E8E0D0]/45">
                        {' '}
                        · {count} {count === 1 ? 'song' : 'songs'}
                      </span>
                    )}
                  </button>
                ) : (
                  <h3 className={headerClass}>{label}</h3>
                )}
                {open && (
                  <div className="space-y-4">
                    {section.tracks.map((track) => trackRow(track, -1))}
                  </div>
                )}
              </div>
            );
          })}
    </div>
  );
}
