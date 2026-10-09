"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { BandSong } from "@/lib/band-songs";
import { BandPlayButton } from "@/components/band/BandAudio";
import { bandSongToPlayerTrack } from "@/lib/player-tracks";
import {
  BAND_SONG_STATUS_LABEL,
  LYRIC_STAGES,
  LYRIC_STAGE_LABEL,
  type LyricStage,
} from "@/lib/band-constants";
import { HOLE_SPLIT_RE, lyricStats, parseLyrics } from "@/lib/lyric-text";

// The lyrics desk: every song's words in one place. Rail of songs on the
// left, a words-only editor in the middle, the latest demo + stats on the
// right. Same document as the song page's Lyrics panel (lib/band-lyrics) —
// the desk just autosaves, folding keystrokes into one revision per writing
// session server-side. The workspace scratch pad (lines not tied to a song
// yet) rides along in the same maps under SCRATCH_ID.

const AUTOSAVE_DELAY_MS = 1200;
// Song ids start at 1, so 0 is free to key the scratch pad.
export const SCRATCH_ID = 0;
// Editor metrics — the textarea, the highlight backdrop and the syllable
// gutter must share these exactly or the overlay drifts off the caret.
const LINE_PX = 28;
const PAD_PX = 16;

const chipBase = "rounded-full border px-2.5 py-0.5 text-[11px] transition";
const chipOff = `${chipBase} border-[#E8E0D0]/20 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/40`;
const chipOn = `${chipBase} border-[#c8a26a] bg-[#c8a26a]/15 text-[#c8a26a]`;

type SortKey = "recent" | "title" | "holes";
type SaveState = "saved" | "saving" | "unsaved" | "error";

export default function LyricsDesk({
  songs,
  workspace,
  initialSongId,
  scratch,
}: {
  songs: BandSong[];
  workspace: { id: number; slug: string };
  // A song id, SCRATCH_ID, or null for "first live song".
  initialSongId: number | null;
  scratch: string;
}) {
  const [bodies, setBodies] = useState<Record<number, string>>(() => ({
    [SCRATCH_ID]: scratch,
    ...Object.fromEntries(songs.map((s) => [s.id, s.lyrics ?? ""])),
  }));
  const [stages, setStages] = useState<Record<number, LyricStage>>(() =>
    Object.fromEntries(songs.map((s) => [s.id, s.lyricStage])),
  );
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    if (initialSongId === SCRATCH_ID) return SCRATCH_ID;
    if (initialSongId !== null && songs.some((s) => s.id === initialSongId))
      return initialSongId;
    return (
      (songs.find((s) => s.status !== "cut") ?? songs[0])?.id ?? SCRATCH_ID
    );
  });
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<LyricStage | null>(null);
  const [showCut, setShowCut] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [error, setError] = useState<string | null>(null);

  // Autosave bookkeeping lives in refs so the timers and unload handler
  // always see the latest text without re-subscribing.
  const bodiesRef = useRef(bodies);
  bodiesRef.current = bodies;
  const stagesRef = useRef(stages);
  stagesRef.current = stages;
  const savedRef = useRef<Record<number, string>>({
    [SCRATCH_ID]: scratch,
    ...Object.fromEntries(songs.map((s) => [s.id, s.lyrics ?? ""])),
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());

  const searchRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLPreElement>(null);

  const dirtyIds = useCallback(
    () =>
      Object.keys(bodiesRef.current)
        .map(Number)
        .filter((id) => bodiesRef.current[id] !== savedRef.current[id]),
    [],
  );

  const setStage = useCallback(async (songId: number, stage: LyricStage) => {
    setStages((prev) => ({ ...prev, [songId]: stage }));
    const res = await fetch(`/api/ostrich/songs/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyricStage: stage }),
    }).catch(() => null);
    if (!res?.ok) setError("Couldn't save the lyric stage");
  }, []);

  // Saves are chained so two quick saves of one song can't land out of order.
  const flush = useCallback(
    (opts: { keepalive?: boolean } = {}) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const ids = dirtyIds();
      if (ids.length === 0) return chainRef.current;
      setSaveState("saving");
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
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body, autosave: true }),
              keepalive: opts.keepalive,
            });
            if (!res.ok) {
              const data = await res.json().catch(() => null);
              throw new Error(data?.error ?? `Couldn't save (${res.status})`);
            }
            savedRef.current[id] = body;
            // First words on a blank song: it's a sketch now.
            if (
              id !== SCRATCH_ID &&
              body.trim() &&
              stagesRef.current[id] === "none"
            )
              void setStage(id, "sketch");
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Something went wrong",
            );
            setSaveState("error");
            return;
          }
        }
        setError(null);
        setSaveState(dirtyIds().length > 0 ? "unsaved" : "saved");
      });
      return chainRef.current;
    },
    [dirtyIds, setStage, workspace.id],
  );

  function edit(text: string) {
    if (selectedId === null) return;
    setBodies((prev) => ({ ...prev, [selectedId]: text }));
    setSaveState("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  // Leaving the page (or the tab going to the background) saves immediately.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden")
        void flush({ keepalive: true });
    };
    // keepalive lets the request outlive the page, so no "leave site?" nag.
    const onUnload = () => void flush({ keepalive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [flush, dirtyIds]);

  const select = useCallback(
    (id: number, focusEditor = false) => {
      void flush();
      setSelectedId(id);
      window.history.replaceState(
        null,
        "",
        `?song=${id === SCRATCH_ID ? "scratch" : id}`,
      );
      if (focusEditor) requestAnimationFrame(() => editorRef.current?.focus());
    },
    [flush],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter((s) => {
      if (!showCut && s.status === "cut" && s.id !== selectedId) return false;
      if (stageFilter && stages[s.id] !== stageFilter) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (bodies[s.id] ?? "").toLowerCase().includes(q)
      );
    });
    if (sort === "title")
      return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "holes")
      return [...list].sort(
        (a, b) =>
          lyricStats(bodies[b.id]).holes - lyricStats(bodies[a.id]).holes,
      );
    return list;
  }, [songs, query, stageFilter, showCut, sort, stages, bodies, selectedId]);

  // Alt+↑/↓ steps through the rail; ⌘K / Ctrl+K jumps to search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        // The scratch pad sits above the first song.
        const order = [SCRATCH_ID, ...visible.map((s) => s.id)];
        const next =
          order[
            order.indexOf(selectedId ?? SCRATCH_ID) +
              (e.key === "ArrowDown" ? 1 : -1)
          ];
        if (next !== undefined)
          select(next, document.activeElement === editorRef.current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, select]);

  const isScratch = selectedId === SCRATCH_ID;
  const song = songs.find((s) => s.id === selectedId) ?? null;
  const body = selectedId === null ? "" : (bodies[selectedId] ?? "");
  const scratchStats = lyricStats(bodies[SCRATCH_ID]);
  const lines = useMemo(() => parseLyrics(body), [body]);
  const stats = useMemo(() => lyricStats(body), [body]);
  const track = song ? bandSongToPlayerTrack(song, workspace.slug) : null;
  const songHref = song ? `/w/${workspace.slug}/songs/${song.id}` : "";

  return (
    <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)_220px]">
      {/* Rail */}
      <aside className="md:sticky md:top-6 md:max-h-[calc(100vh-8rem)] md:overflow-y-auto">
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && visible[0]) {
              e.preventDefault();
              select(visible[0].id, true);
            } else if (e.key === "Escape") {
              editorRef.current?.focus();
            }
          }}
          placeholder="Find a song or a line…  ⌘K"
          className="w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 transition focus:border-[#E8E0D0]/50 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {LYRIC_STAGES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStageFilter(stageFilter === st ? null : st)}
              className={stageFilter === st ? chipOn : chipOff}
            >
              {LYRIC_STAGE_LABEL[st]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#E8E0D0]/45">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={showCut}
              onChange={(e) => setShowCut(e.target.checked)}
              className="accent-[#c8a26a]"
            />
            show cut
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded border border-[#E8E0D0]/15 bg-[#2A2420] px-1.5 py-0.5 text-[11px] text-[#E8E0D0]/70"
          >
            <option value="recent">recent</option>
            <option value="title">A–Z</option>
            <option value="holes">most holes</option>
          </select>
        </div>

        {/* Phones get a picker instead of the full rail. */}
        <select
          value={selectedId ?? ""}
          onChange={(e) => select(Number(e.target.value))}
          aria-label="Song"
          className="mt-3 w-full rounded-md border border-[#E8E0D0]/20 bg-[#2A2420] px-3 py-2 text-sm text-[#E8E0D0] md:hidden"
        >
          <option value={SCRATCH_ID}>✎ Scratch pad</option>
          {visible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>

        {/* Always on top, outside the filters — it isn't a song. */}
        <button
          type="button"
          onClick={() => select(SCRATCH_ID, true)}
          className={`mt-3 hidden w-full rounded-md border border-dashed px-3 py-2 text-left transition md:block ${
            isScratch
              ? "border-[#c8a26a]/60 bg-[#c8a26a]/10"
              : "border-[#E8E0D0]/20 hover:border-[#E8E0D0]/40 hover:bg-[#E8E0D0]/[0.03]"
          }`}
        >
          <span className="block text-sm text-[#E8E0D0]/85">✎ Scratch pad</span>
          <span className="mt-0.5 block text-[11px] text-[#E8E0D0]/40">
            {scratchStats.lines > 0
              ? `${scratchStats.lines} loose line${scratchStats.lines === 1 ? "" : "s"}`
              : "lines that don’t have a song yet"}
          </span>
        </button>

        <ul className="mt-2 hidden space-y-0.5 md:block">
          {visible.map((s) => {
            const st = lyricStats(bodies[s.id]);
            const on = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(s.id, true)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition ${
                    on
                      ? "border-[#c8a26a]/60 bg-[#c8a26a]/10"
                      : "border-transparent hover:border-[#E8E0D0]/15 hover:bg-[#E8E0D0]/[0.03]"
                  }`}
                >
                  <span
                    className={`block truncate text-sm ${
                      on ? "text-[#E8E0D0]" : "text-[#E8E0D0]/80"
                    } ${s.status === "cut" ? "line-through opacity-60" : ""}`}
                  >
                    {s.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[#E8E0D0]/40">
                    {LYRIC_STAGE_LABEL[stages[s.id]]}
                    {st.words > 0 && ` · ${st.words} words`}
                    {st.holes > 0 && (
                      <span className="text-[#F5A3A3]/80">
                        {` · ${st.holes} hole${st.holes === 1 ? "" : "s"}`}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-3 py-2 text-xs text-[#E8E0D0]/40">
              {songs.length === 0 ? "No songs yet." : "Nothing matches."}
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
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h2 className="text-xl font-semibold">
              {song ? song.title : "Scratch pad"}
            </h2>
            <span
              className={`text-[11px] ${
                saveState === "error"
                  ? "text-[#F5A3A3]"
                  : saveState === "saved"
                    ? "text-[#E8E0D0]/35"
                    : "text-[#c8a26a]"
              }`}
            >
              {saveState === "saved"
                ? "saved"
                : saveState === "saving"
                  ? "saving…"
                  : saveState === "unsaved"
                    ? "editing…"
                    : "not saved"}
            </span>
          </div>
          {song ? (
            <div className="mb-3 flex flex-wrap gap-1">
              {LYRIC_STAGES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => void setStage(song.id, st)}
                  className={stages[song.id] === st ? chipOn : chipOff}
                >
                  {LYRIC_STAGE_LABEL[st]}
                </button>
              ))}
            </div>
          ) : (
            <p className="mb-3 text-xs text-[#E8E0D0]/45">
              Loose lines, images and half-ideas. Copy them into a song when
              they find a home.
            </p>
          )}

          <div className="flex rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]">
            <div className="relative min-w-0 flex-1">
              {/* Highlight backdrop: same text, same metrics, drawn under a
                  transparent-text textarea. Color/background only — never
                  weight or size, which would shift glyph widths. */}
              <pre
                ref={backdropRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre font-sans text-[17px] text-[#E8E0D0]/90"
                style={{ padding: PAD_PX, lineHeight: `${LINE_PX}px` }}
              >
                {lines.map((l, i) => (
                  <span key={i}>
                    {l.kind === "section" ? (
                      <span className="text-[#c8a26a]">{l.text}</span>
                    ) : l.hasHole ? (
                      l.text.split(HOLE_SPLIT_RE).map((part, j) =>
                        j % 2 === 1 ? (
                          <span
                            key={j}
                            className="bg-[#F5A3A3]/20 text-[#F5A3A3]"
                          >
                            {part}
                          </span>
                        ) : (
                          part
                        ),
                      )
                    ) : (
                      l.text
                    )}
                    {"\n"}
                  </span>
                ))}
              </pre>
              <textarea
                ref={editorRef}
                key={selectedId ?? SCRATCH_ID}
                value={body}
                onChange={(e) => edit(e.target.value)}
                onScroll={(e) => {
                  if (backdropRef.current)
                    backdropRef.current.scrollLeft = e.currentTarget.scrollLeft;
                }}
                wrap="off"
                spellCheck
                placeholder={
                  song
                    ? "[verse 1]\nfirst line…\na line with a ??? still to write"
                    : "a line you overheard…\nan image that might be a chorus…"
                }
                aria-label={song ? `Lyrics for ${song.title}` : "Scratch pad"}
                className="relative block w-full resize-none overflow-x-auto overflow-y-hidden bg-transparent font-sans text-[17px] text-transparent caret-[#E8E0D0] placeholder:text-[#E8E0D0]/25 focus:outline-none"
                style={{
                  padding: PAD_PX,
                  lineHeight: `${LINE_PX}px`,
                  // Grows with the song so the page scrolls, not the box;
                  // the extra line leaves room for a horizontal scrollbar.
                  height: Math.max(14, lines.length + 2) * LINE_PX + PAD_PX * 2,
                }}
              />
            </div>
            {/* Syllables per line; "+" when a hole means the count is short. */}
            <div
              aria-hidden
              className="w-10 shrink-0 select-none border-l border-[#E8E0D0]/10 pr-2 text-right text-[11px] tabular-nums text-[#E8E0D0]/35"
              style={{ paddingTop: PAD_PX, lineHeight: `${LINE_PX}px` }}
            >
              {lines.map((l, i) => (
                <div key={i} style={{ height: LINE_PX }}>
                  {l.kind === "line"
                    ? `${l.syllables}${l.hasHole ? "+" : ""}`
                    : ""}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
              {error}{" "}
              <button
                type="button"
                onClick={() => void flush()}
                className="font-semibold underline underline-offset-2"
              >
                retry
              </button>
            </div>
          )}
        </section>
      )}

      {/* Side panel — below the editor until there's room for a third column. */}
      {(song || isScratch) && (
        <aside className="space-y-5 text-sm md:col-start-2 lg:col-start-auto lg:sticky lg:top-6 lg:self-start">
          {song && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                Latest recording
              </p>
              {track ? (
                <div className="flex items-center gap-2">
                  <BandPlayButton track={track} queue={[track]} />
                  <span className="truncate text-[#E8E0D0]/75">
                    {song.latestVersionLabel}
                  </span>
                </div>
              ) : (
                <p className="text-[#E8E0D0]/40">No recordings yet.</p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["lines", stats.lines],
                ["words", stats.words],
                ["holes", stats.holes],
              ] as const
            ).map(([label, n]) => (
              <div
                key={label}
                className="rounded-md border border-[#E8E0D0]/10 py-2"
              >
                <dd
                  className={`text-lg tabular-nums ${
                    label === "holes" && n > 0
                      ? "text-[#F5A3A3]"
                      : "text-[#E8E0D0]"
                  }`}
                >
                  {n}
                </dd>
                <dt className="text-[10px] uppercase tracking-wide text-[#E8E0D0]/40">
                  {label}
                </dt>
              </div>
            ))}
          </dl>

          {song && (
            <p className="text-xs text-[#E8E0D0]/50">
              {BAND_SONG_STATUS_LABEL[song.status]}
              {song.tags.length > 0 && ` · ${song.tags.join(", ")}`}
            </p>
          )}

          {song?.notes && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/45">
                Notes
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#E8E0D0]/65">
                {song.notes}
              </p>
            </div>
          )}

          {song && (
            <Link
              href={songHref}
              onClick={() => void flush()}
              className="block text-xs text-[#E8E0D0]/45 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
            >
              Song page, versions &amp; history →
            </Link>
          )}

          <div className="rounded-md border border-[#E8E0D0]/10 p-3 text-[11px] leading-relaxed text-[#E8E0D0]/45">
            <p>
              <span className="text-[#c8a26a]">[chorus]</span> on its own line
              starts a section.
            </p>
            <p className="mt-1">
              <span className="bg-[#F5A3A3]/20 text-[#F5A3A3]">???</span> or{" "}
              <span className="bg-[#F5A3A3]/20 text-[#F5A3A3]">~</span> marks
              words still to write.
            </p>
            <p className="mt-1">
              Saves as you type; each sitting is one entry in history.
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}
