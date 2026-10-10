'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BandSong, BandSongComment, BandSongVersion } from '@/lib/band-songs';
import type { LyricsRevision } from '@/lib/band-lyrics';
import { bandVersionToPlayerTrack } from '@/lib/player-tracks';
import type { ColorLabels, SongColor } from '@/lib/band-constants';
import {
  SCRATCH_ID,
  cleanLyrics,
  lyricStats,
  parseLyrics,
  toggleFlags,
  type LyricSegmentKind,
} from '@/lib/lyric-text';
import SongMetaEditor from '@/components/band/SongMetaEditor';
import { ColorDot, ColorLegend, colorCounts } from '@/components/band/SongColors';
import BandLyrics from '@/components/band/BandLyrics';
import BandVersionCard from '@/components/band/BandVersionCard';
import BandVersionUpload from '@/components/band/BandVersionUpload';
import BandSongComments from '@/components/band/BandSongComments';

// The lyrics desk — the workspace's main room. Rail of songs on the left, a
// words-only editor in the middle (with the song's details above it), and
// the open song's recordings, comments and lyrics history on the right.
// Same lyrics document as the song page (lib/band-lyrics) — the desk just
// autosaves, folding keystrokes into one revision per writing session
// server-side. The workspace scratch pad (lines not tied to a song yet)
// rides along in the same maps under SCRATCH_ID.
//
// Switching songs is router.replace(?song=…): the server page re-renders
// with that song's `detail` while this component keeps its state (bodies,
// filters, autosave queue). The reused song-page components refresh the
// route after their own edits, which lands back here the same way.

const AUTOSAVE_DELAY_MS = 1200;
// Editor metrics — the textarea, the highlight backdrop and the syllable
// gutter must share these exactly or the overlay drifts off the caret.
const LINE_PX = 28;
const PAD_PX = 16;
const GUTTER_PX = 40;

const chipBase = 'rounded-full border px-2.5 py-0.5 text-[11px] transition';
const chipOff = `${chipBase} border-[#E8E0D0]/20 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/40`;
const chipOn = `${chipBase} border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]`;

type SortKey = 'recent' | 'title' | 'work';

// Backdrop colours per segment — color/background only (see the backdrop).
const SEGMENT_CLASS: Record<LyricSegmentKind, string> = {
  plain: '',
  flag: 'text-[#F2A65A]',
  hole: 'bg-[#F5A3A3]/20 text-[#F5A3A3]',
  mark: 'text-[#E9D46A]/40',
  highlight: 'bg-[#E9D46A]/25 text-[#F5EBB0]',
  note: 'text-[#E8E0D0]/35',
};

// ⌘ on Macs, Ctrl elsewhere — Ctrl+E/B are caret moves in Mac text fields.
function isModKey(e: React.KeyboardEvent): boolean {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
}
type SaveState = 'saved' | 'saving' | 'unsaved' | 'error';
type PanelTab = 'recordings' | 'comments' | 'history';

export interface DeskSongDetail {
  songId: number;
  versions: BandSongVersion[];
  comments: BandSongComment[];
  // Newest first.
  revisions: LyricsRevision[];
}

export default function LyricsDesk({
  songs,
  workspace,
  selectedFromServer,
  scratch,
  allTags,
  colorLabels,
  detail,
  viewerMemberId,
  canModerate,
}: {
  songs: BandSong[];
  workspace: { id: number; slug: string };
  // The song (or SCRATCH_ID) the server rendered detail for.
  selectedFromServer: number;
  scratch: string;
  allTags: string[];
  colorLabels: ColorLabels;
  detail: DeskSongDetail | null;
  viewerMemberId: number | null;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [bodies, setBodies] = useState<Record<number, string>>(() => ({
    [SCRATCH_ID]: scratch,
    ...Object.fromEntries(songs.map((s) => [s.id, s.lyrics ?? ''])),
  }));
  const [pickedId, setPickedId] = useState<number>(selectedFromServer);
  // A pick that no longer exists (the song was just deleted) falls back to
  // whatever the server chose.
  const selectedId =
    pickedId === SCRATCH_ID || songs.some((s) => s.id === pickedId) ? pickedId : selectedFromServer;
  const [tab, setTab] = useState<PanelTab>('recordings');
  // Phones: the song list is a full-screen sheet instead of a rail.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [query, setQuery] = useState('');
  const [colorFilter, setColorFilter] = useState<SongColor | 'none' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>('recent');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Autosave bookkeeping lives in refs so the timers and unload handler
  // always see the latest text without re-subscribing.
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  const savedRef = useRef<Record<number, string>>({
    [SCRATCH_ID]: scratch,
    ...Object.fromEntries(songs.map((s) => [s.id, s.lyrics ?? ''])),
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const dirtyIds = useCallback(
    () =>
      Object.keys(bodiesRef.current)
        .map(Number)
        .filter((id) => bodiesRef.current[id] !== savedRef.current[id]),
    []
  );

  // Saves are chained so two quick saves of one song can't land out of order.
  const flush = useCallback(
    (opts: { keepalive?: boolean } = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const ids = dirtyIds();
      if (ids.length === 0) return chainRef.current;
      setSaveState('saving');
      chainRef.current = chainRef.current.then(async () => {
        for (const id of ids) {
          const body = bodiesRef.current[id];
          if (body === savedRef.current[id]) continue;
          try {
            const url =
              id === SCRATCH_ID
                ? `/api/ostrich/workspaces/${workspace.id}/scratch`
                : `/api/ostrich/songs/${id}/lyrics`;
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body, autosave: true }),
              keepalive: opts.keepalive,
            });
            if (!res.ok) {
              const data = await res.json().catch(() => null);
              throw new Error(data?.error ?? `Couldn't save (${res.status})`);
            }
            savedRef.current[id] = body;
            // First words on a blank song: it's a sketch now.
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setSaveState('error');
            return;
          }
        }
        setError(null);
        setSaveState(dirtyIds().length > 0 ? 'unsaved' : 'saved');
      });
      return chainRef.current;
    },
    [dirtyIds, workspace.id]
  );

  function edit(text: string) {
    setBodies((prev) => ({ ...prev, [selectedId]: text }));
    setSaveState('unsaved');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  // Programmatic edits go through execCommand so ⌘Z still undoes them; the
  // resulting input event reaches onChange like a keystroke would.
  function replaceRange(start: number, end: number, text: string, sel: [number, number]) {
    const ta = editorRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(start, end);
    if (!document.execCommand('insertText', false, text)) {
      edit(ta.value.slice(0, start) + text + ta.value.slice(end));
    }
    requestAnimationFrame(() => ta.setSelectionRange(sel[0], sel[1]));
  }

  function toggleFlagLines(from: number, to: number) {
    const ta = editorRef.current;
    if (!ta) return;
    const all = ta.value.split('\n');
    const start = all.slice(0, from).reduce((n, l) => n + l.length + 1, 0);
    const block = all.slice(from, to + 1).join('\n');
    const next = toggleFlags(block, 0, to - from);
    if (next === block) return;
    const end = start + block.length;
    // One line: keep the caret where it was, shifted by the marker.
    // Several: select the whole block so another ⌘E toggles it back.
    const caret = ta.selectionStart;
    const delta = next.length - block.length;
    const sel: [number, number] =
      from === to && caret >= start && caret <= end
        ? [Math.max(start, caret + delta), Math.max(start, caret + delta)]
        : [start, start + next.length];
    replaceRange(start, end, next, sel);
  }

  function flagSelection() {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const from = value.slice(0, a).split('\n').length - 1;
    let to = value.slice(0, b).split('\n').length - 1;
    // A selection ending at the very start of a line doesn't include it.
    if (b > a && value[b - 1] === '\n') to--;
    toggleFlagLines(from, Math.max(from, to));
  }

  // ⌘B: wrap the selection in ==…==, or unwrap the highlight the caret or
  // selection sits in. Single-line only.
  function toggleHighlight() {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const lineStart = value.lastIndexOf('\n', a - 1) + 1;
    const nl = value.indexOf('\n', a);
    const lineEnd = nl === -1 ? value.length : nl;
    if (b > lineEnd) return;
    const line = value.slice(lineStart, lineEnd);
    for (const m of line.matchAll(/==[^=\n]+?==/g)) {
      const s = lineStart + (m.index ?? 0);
      const e = s + m[0].length;
      if (a >= s && b <= e) {
        replaceRange(s, e, m[0].slice(2, -2), [s, e - 4]);
        return;
      }
    }
    if (a === b) return;
    const picked = value.slice(a, b);
    const lead = picked.length - picked.trimStart().length;
    const trail = picked.length - picked.trimEnd().length;
    const s = a + lead;
    const e = b - trail;
    if (e <= s) return;
    replaceRange(s, e, `==${value.slice(s, e)}==`, [s + 2, e + 2]);
  }

  function insertHole() {
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: a, selectionEnd: b } = ta;
    replaceRange(a, b, '???', [a + 3, a + 3]);
  }

  // Leaving the page (or the tab going to the background) saves immediately.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush({ keepalive: true });
    };
    // keepalive lets the request outlive the page, so no "leave site?" nag.
    const onUnload = () => void flush({ keepalive: true });
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flush, dirtyIds]);

  const select = useCallback(
    (id: number, focusEditor = false) => {
      void flush();
      setPickedId(id);
      setSheetOpen(false);
      // Don't pop the keyboard on a phone just for switching songs.
      if (!window.matchMedia('(min-width: 768px)').matches) focusEditor = false;
      startTransition(() =>
        router.replace(`?song=${id === SCRATCH_ID ? 'scratch' : id}`, { scroll: false })
      );
      if (focusEditor) requestAnimationFrame(() => editorRef.current?.focus());
    },
    [flush, router]
  );

  async function addSong(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setError(null);
    const res = await fetch('/api/ostrich/songs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, workspaceId: workspace.id }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok || !data?.song) {
      setError(data?.error ?? "Couldn't add the song");
      return;
    }
    setNewTitle('');
    select(Number(data.song.id), true);
  }

  // The history tab reads server revisions; autosaves since the last render
  // aren't in them yet, so opening it re-fetches.
  function openTab(next: PanelTab) {
    setTab(next);
    if (next === 'history') {
      void flush().then(() => startTransition(() => router.refresh()));
    }
  }

  // History restore: becomes the editor's text and autosaves like typing.
  function restoreLyrics(text: string) {
    edit(text);
    void flush();
  }

  // The current revision was deleted: the server's lyrics are now the one
  // before it, so the editor (which isn't dirty) follows.
  function currentDeleted(nowCurrent: string) {
    setBodies((prev) => ({ ...prev, [selectedId]: nowCurrent }));
    savedRef.current[selectedId] = nowCurrent;
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter((s) => {
      if (!showArchived && s.archivedAt && s.id !== selectedId) return false;
      if (colorFilter && (s.color ?? 'none') !== colorFilter) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || (bodies[s.id] ?? '').toLowerCase().includes(q);
    });
    if (sort === 'title') return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'work') {
      const toFix = (id: number) => {
        const st = lyricStats(bodies[id]);
        return st.holes + st.flags;
      };
      return [...list].sort((a, b) => toFix(b.id) - toFix(a.id));
    }
    return list;
  }, [songs, query, colorFilter, showArchived, sort, bodies, selectedId]);

  // Alt+↑/↓ steps through the rail; ⌘K / Ctrl+K jumps to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        // The scratch pad sits above the first song.
        const order = [SCRATCH_ID, ...visible.map((s) => s.id)];
        const next = order[order.indexOf(selectedId) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (next !== undefined) select(next, document.activeElement === editorRef.current);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, selectedId, select]);

  const isScratch = selectedId === SCRATCH_ID;
  const saveLabel = { saved: 'saved', saving: 'saving…', unsaved: 'editing…', error: 'not saved' }[
    saveState
  ];
  const saveClass =
    saveState === 'error'
      ? 'text-[#F5A3A3]'
      : saveState === 'saved'
        ? 'text-[#E8E0D0]/35'
        : 'text-[#c8a26a]';
  const liveColorCounts = colorCounts(songs.filter((s) => !s.archivedAt));
  const song = songs.find((s) => s.id === selectedId) ?? null;
  const body = bodies[selectedId] ?? '';
  const scratchStats = lyricStats(bodies[SCRATCH_ID]);
  const lines = useMemo(() => parseLyrics(body), [body]);
  const stats = useMemo(() => lyricStats(body), [body]);
  const songHref = song ? `/w/${workspace.slug}/songs/${song.id}` : '';
  // Detail arrives a beat after a switch; until then the panel says so.
  const songDetail = song && detail?.songId === song.id ? detail : null;
  const playQueue = songDetail
    ? songDetail.versions
        .filter((v) => v.url)
        .map((v) => bandVersionToPlayerTrack(v, song!.title, songHref))
    : [];
  const revisionRefs = songDetail
    ? songDetail.revisions.map((r) => ({ id: r.id, createdAt: r.createdAt, body: r.body }))
    : [];

  return (
    <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_380px]">
      {/* Rail */}
      <aside
        className={
          sheetOpen
            ? 'fixed inset-0 z-50 overflow-y-auto bg-[#221d19] px-4 pb-24 pt-3'
            : 'hidden md:sticky md:top-6 md:block md:max-h-[calc(100vh-8rem)] md:overflow-y-auto'
        }
      >
        <div className="mb-3 flex items-center justify-between md:hidden">
          <span className="text-lg font-semibold">Songs</span>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close song list"
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
          >
            ×
          </button>
        </div>
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && visible[0]) {
              e.preventDefault();
              select(visible[0].id, true);
            } else if (e.key === 'Escape') {
              editorRef.current?.focus();
            }
          }}
          placeholder="Find a song or a line…"
          className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-base md:text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 transition focus:border-[#E8E0D0]/50 focus:outline-none"
        />
        <form onSubmit={addSong} className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="+ New song"
            aria-label="New song title"
            className="min-w-0 flex-1 rounded-md border border-[#E8E0D0]/15 bg-transparent px-3 py-1.5 text-base md:text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/35 transition focus:border-[#E8E0D0]/50 focus:outline-none"
          />
          {newTitle.trim() && (
            <button
              type="submit"
              className="shrink-0 rounded-md bg-[#E8E0D0] px-3 text-xs font-semibold text-[#2A2420] transition hover:bg-white"
            >
              Add
            </button>
          )}
        </form>
        <div className="mt-2">
          <ColorLegend
            workspaceId={workspace.id}
            labels={colorLabels}
            counts={liveColorCounts}
            active={colorFilter}
            onPick={setColorFilter}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#E8E0D0]/45">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-[#c8a26a]"
            />
            archived
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-[#E8E0D0]/15 bg-[#2A2420] px-1.5 py-0.5 text-[11px] text-[#E8E0D0]/70"
          >
            <option value="recent">recent</option>
            <option value="title">A–Z</option>
            <option value="work">most to fix</option>
          </select>
        </div>

        {/* Always on top, outside the filters — it isn't a song. */}
        <button
          type="button"
          onClick={() => select(SCRATCH_ID, true)}
          className={`mt-3 block w-full rounded-md border border-dashed px-3 py-2.5 text-left transition md:py-2 ${
            isScratch
              ? 'border-[#c8a26a]/60 bg-[#c8a26a]/10'
              : 'border-[#E8E0D0]/20 hover:border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/[0.03]'
          }`}
        >
          <span className="block text-sm text-[#E8E0D0]/85">✎ Scratch pad</span>
          <span className="mt-0.5 block text-[11px] text-[#E8E0D0]/40">
            {scratchStats.lines > 0
              ? `${scratchStats.lines} loose line${scratchStats.lines === 1 ? '' : 's'}`
              : 'lines that don’t have a song yet'}
          </span>
        </button>

        <ul className="mt-2 space-y-0.5">
          {visible.map((s) => {
            const st = lyricStats(bodies[s.id]);
            const on = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id, true)}
                  className={`w-full rounded-md border px-3 py-2.5 text-left transition md:py-2 ${
                    on
                      ? 'border-[#c8a26a]/60 bg-[#c8a26a]/10'
                      : 'border-transparent hover:border-[#E8E0D0]/15 hover:bg-[#E8E0D0]/[0.03]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ColorDot color={s.color} labels={colorLabels} />
                    <span
                      className={`truncate text-sm ${on ? 'text-[#E8E0D0]' : 'text-[#E8E0D0]/80'} ${
                        s.archivedAt ? 'opacity-50' : ''
                      }`}
                    >
                      {s.title}
                    </span>
                  </span>
                  <span className="mt-0.5 block pl-[18px] text-[11px] text-[#E8E0D0]/40">
                    {st.words > 0 ? `${st.words} words` : 'no words yet'}
                    {st.holes > 0 && (
                      <span className="text-[#F5A3A3]/80">
                        {` · ${st.holes} hole${st.holes === 1 ? '' : 's'}`}
                      </span>
                    )}
                    {st.flags > 0 && (
                      <span className="text-[#F2A65A]/80">{` · ${st.flags} flagged`}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#E8E0D0]/40">
              {songs.length === 0 ? 'No songs yet.' : 'Nothing matches.'}
            </li>
          )}
        </ul>
        <p className="mt-3 hidden px-1 text-[10px] text-[#E8E0D0]/30 md:block">
          ⌥↑ / ⌥↓ to step through songs
        </p>
      </aside>

      {/* Editor */}
      {(song || isScratch) && (
        <section className="min-w-0">
          {/* Phones: always-reachable bar to open the song list. */}
          <div className="sticky top-0 z-30 -mx-3 mb-3 flex h-11 items-center gap-3 border-b border-[#E8E0D0]/10 bg-[#2A2420] px-3 md:hidden">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex min-w-0 items-center gap-2 rounded-md border border-[#E8E0D0]/20 px-3 py-1.5 text-sm text-[#E8E0D0]/85 active:bg-[#E8E0D0]/10"
            >
              <span aria-hidden>☰</span>
              {song && <ColorDot color={song.color} labels={colorLabels} />}
              <span className="truncate">{song ? song.title : 'Scratch pad'}</span>
            </button>
            <span className={`ml-auto shrink-0 text-[11px] ${saveClass}`}>{saveLabel}</span>
          </div>
          {song ? (
            <SongMetaEditor
              key={song.id}
              song={song}
              allTags={allTags}
              canDelete={
                canModerate || (viewerMemberId !== null && song.createdBy === viewerMemberId)
              }
              basePath={`/w/${workspace.slug}`}
              colorLabels={colorLabels}
            />
          ) : (
            <>
              <h2 className="text-2xl font-semibold">Scratch pad</h2>
              <p className="mt-1 text-sm text-[#E8E0D0]/50">
                Loose lines, images and half-ideas. Copy them into a song when they find a home.
              </p>
            </>
          )}
          {/* Markup buttons — the only way to flag/highlight on a phone, and
              handy on desktop. Pinned under the mobile bar while scrolling.
              onPointerDown keeps the textarea's focus and selection. */}
          <div className="sticky top-11 z-20 -mx-3 mt-4 flex items-center gap-1 border-b border-[#E8E0D0]/10 bg-[#2A2420] px-3 py-1.5 md:static md:mx-0 md:mb-2 md:border-0 md:bg-transparent md:px-0">
            {(
              [
                ['⚑ Flag', 'Flag line(s) — ⌘E', flagSelection],
                ['Highlight', 'Highlight selection — ⌘B', toggleHighlight],
                ['???', 'Insert a hole', insertHole],
              ] as const
            ).map(([label, title, run]) => (
              <button
                key={label}
                type="button"
                title={title}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => run()}
                className="rounded-md border border-[#E8E0D0]/15 px-2.5 py-1 text-xs text-[#E8E0D0]/70 transition hover:border-[#E8E0D0]/40 hover:text-[#E8E0D0] active:bg-[#E8E0D0]/10"
              >
                {label}
              </button>
            ))}
            <span className={`ml-auto hidden text-[11px] md:inline ${saveClass}`}>{saveLabel}</span>
          </div>

          <div className="-mx-3 flex border-y border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] sm:mx-0 sm:rounded-lg sm:border">
            {/* The styled copy is in normal flow and sets the height; the
                transparent-text textarea sits exactly on top of it. Same
                width, padding, font and pre-wrap, so both wrap identically —
                long lines wrap on a phone instead of scrolling sideways.
                Styling is color/background only: weight or size would shift
                glyph widths and drift the overlay off the caret. */}
            <div className="relative isolate min-w-0 flex-1">
              <div
                aria-hidden
                className="pointer-events-none whitespace-pre-wrap break-words font-sans text-[17px] text-[#E8E0D0]/90"
                style={{
                  padding: PAD_PX,
                  lineHeight: `${LINE_PX}px`,
                  minHeight: 12 * LINE_PX + PAD_PX * 2,
                }}
              >
                {lines.map((l, i) => (
                  <div key={i} className="relative">
                    {l.flagged && (
                      <span
                        className="absolute inset-y-0 -z-10 border-l-2 border-[#F2A65A] bg-[#F2A65A]/10"
                        style={{ left: -PAD_PX, right: -PAD_PX }}
                      />
                    )}
                    {l.text === '' ? (
                      ' '
                    ) : l.kind === 'section' ? (
                      <span className="text-[#c8a26a]">{l.text}</span>
                    ) : (
                      l.segments.map((seg, j) =>
                        seg.kind === 'plain' ? (
                          seg.text
                        ) : (
                          <span key={j} className={SEGMENT_CLASS[seg.kind]}>
                            {seg.text}
                          </span>
                        )
                      )
                    )}
                    {/* Syllables, out in the gutter column; tap to flag. */}
                    {l.kind === 'line' && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => toggleFlagLines(i, i)}
                        title={l.flagged ? 'Unflag line (⌘E)' : 'Flag line (⌘E)'}
                        aria-label={`${l.flagged ? 'Unflag' : 'Flag'} line ${i + 1}`}
                        className={`pointer-events-auto absolute top-0 pr-2 text-right text-[11px] tabular-nums transition hover:bg-[#F2A65A]/10 hover:text-[#F2A65A] ${
                          l.flagged ? 'text-[#F2A65A]' : 'text-[#E8E0D0]/35'
                        }`}
                        style={{
                          left: `calc(100% + ${PAD_PX}px)`,
                          width: GUTTER_PX,
                          height: LINE_PX,
                        }}
                      >
                        {l.syllables || l.hasHole ? `${l.syllables}${l.hasHole ? '+' : ''}` : ''}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <textarea
                ref={editorRef}
                key={selectedId}
                value={body}
                onChange={(e) => edit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.altKey || e.shiftKey || !isModKey(e)) return;
                  const k = e.key.toLowerCase();
                  if (k === 'e') {
                    e.preventDefault();
                    flagSelection();
                  } else if (k === 'b') {
                    e.preventDefault();
                    toggleHighlight();
                  }
                }}
                spellCheck
                autoCapitalize="sentences"
                placeholder={
                  song
                    ? '[verse 1]\nfirst line…\na line with a ??? still to write'
                    : 'a line you overheard…\nan image that might be a chorus…'
                }
                aria-label={song ? `Lyrics for ${song.title}` : 'Scratch pad'}
                className="absolute inset-0 block h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent font-sans text-[17px] text-transparent caret-[#E8E0D0] placeholder:text-[#E8E0D0]/25 focus:outline-none"
                style={{ padding: PAD_PX, lineHeight: `${LINE_PX}px` }}
              />
            </div>
            {/* The gutter column the syllable buttons above sit in. */}
            <div
              aria-hidden
              className="shrink-0 border-l border-[#E8E0D0]/10"
              style={{ width: GUTTER_PX }}
            />
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
              {error}{' '}
              <button
                type="button"
                onClick={() => void flush()}
                className="font-semibold underline underline-offset-2"
              >
                retry
              </button>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#E8E0D0]/45">
            <span className="tabular-nums">
              {stats.lines} lines · {stats.words} words
              {stats.holes > 0 && (
                <span className="text-[#F5A3A3]/85">{` · ${stats.holes} holes`}</span>
              )}
              {stats.flags > 0 && (
                <span className="text-[#F2A65A]/85">{` · ${stats.flags} flagged`}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(cleanLyrics(body)).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              title="Copy without flags, highlights and notes"
              className="underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              {copied ? 'copied ✓' : 'copy clean lyrics'}
            </button>
          </div>

          <details className="mt-3 text-[11px] leading-relaxed text-[#E8E0D0]/45">
            <summary className="cursor-pointer select-none hover:text-[#E8E0D0]/70">
              Markup &amp; shortcuts
            </summary>
            <div className="mt-2 space-y-1 rounded-md border border-[#E8E0D0]/10 p-3">
              <p>
                <span className="text-[#c8a26a]">[chorus]</span> on its own line starts a section.
              </p>
              <p>
                <span className="bg-[#F5A3A3]/20 text-[#F5A3A3]">???</span> or{' '}
                <span className="bg-[#F5A3A3]/20 text-[#F5A3A3]">~</span> marks words still to
                write.
              </p>
              <p>
                <span className="text-[#F2A65A]">⌘E</span> (or click a syllable count) flags the
                line; <span className="bg-[#E9D46A]/25 text-[#F5EBB0]">⌘B</span> highlights the
                selected words.
              </p>
              <p>
                <span className="text-[#E8E0D0]/70">{'// note'}</span> at the end of a line is a
                note to self.
              </p>
              <p>⌘K finds a song; ⌥↑ / ⌥↓ steps through them.</p>
              <p>Saves as you type; each sitting is one entry in history.</p>
            </div>
          </details>
        </section>
      )}

      {/* The open song's recordings, comments and lyrics history — a third
          column on wide screens, under the editor otherwise. */}
      {song && (
        <aside className="min-w-0 md:col-start-2 xl:col-start-auto xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
          <div className="mb-4 flex gap-1.5">
            {(
              [
                ['recordings', 'Recordings', songDetail?.versions.length ?? song.versionCount],
                ['comments', 'Comments', songDetail?.comments.length ?? song.commentCount],
                ['history', 'History', songDetail?.revisions.length],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => openTab(key)}
                className={tab === key ? chipOn : chipOff}
              >
                {label}
                {n ? ` ${n}` : ''}
              </button>
            ))}
          </div>

          {!songDetail ? (
            <p className="text-sm text-[#E8E0D0]/40">Loading…</p>
          ) : tab === 'recordings' ? (
            <div>
              {songDetail.versions.length === 0 ? (
                <p className="mb-4 text-sm text-[#E8E0D0]/40">No recordings yet.</p>
              ) : (
                <div className="mb-4 space-y-3">
                  {songDetail.versions.map((v) => (
                    <BandVersionCard
                      key={v.id}
                      version={v}
                      markers={songDetail.comments.filter(
                        (c) => c.versionId === v.id && c.timestampSeconds !== null
                      )}
                      canEdit={
                        canModerate || (viewerMemberId !== null && v.uploadedBy === viewerMemberId)
                      }
                      lyricsRevisions={revisionRefs}
                      songTitle={song.title}
                      songHref={songHref}
                      queue={playQueue}
                    />
                  ))}
                </div>
              )}
              <BandVersionUpload
                key={song.id}
                songId={song.id}
                versionCount={songDetail.versions.length}
                beforeRegister={() => flush()}
              />
            </div>
          ) : tab === 'comments' ? (
            <BandSongComments
              key={song.id}
              songId={song.id}
              comments={songDetail.comments}
              viewerMemberId={viewerMemberId}
              canModerate={canModerate}
            />
          ) : (
            <BandLyrics
              key={song.id}
              songId={song.id}
              revisions={songDetail.revisions}
              historyOnly
              onRestore={restoreLyrics}
              onCurrentDeleted={currentDeleted}
            />
          )}

          <Link
            href={songHref}
            onClick={() => void flush()}
            className="mt-6 block text-xs text-[#E8E0D0]/35 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
          >
            Open the old song page →
          </Link>
        </aside>
      )}
    </div>
  );
}
