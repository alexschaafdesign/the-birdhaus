'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SONG_COLORS,
  SONG_COLOR_HEX,
  colorName,
  type ColorLabels,
  type SongColor,
} from '@/lib/band-constants';

// Song colors — the workspace's one status system (migration 102): a dot on
// every song, a picker on the open song, and a legend that filters the list
// and lets anyone name the colors.

export function ColorDot({
  color,
  labels,
  size = 10,
}: {
  color: SongColor | null;
  labels?: ColorLabels;
  size?: number;
}) {
  if (!color) {
    return (
      <span
        aria-hidden
        className="inline-block shrink-0 rounded-full border border-[#E8E0D0]/20"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={labels ? colorName(color, labels) : undefined}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: SONG_COLOR_HEX[color] }}
    />
  );
}

// One click sets (or clears) the song's color and refreshes the route.
export function SongColorPicker({
  songId,
  value,
  labels,
}: {
  songId: number;
  value: SongColor | null;
  labels: ColorLabels;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<SongColor | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const shown = pending === undefined ? value : pending;

  async function pick(color: SongColor | null) {
    setPending(color);
    setError(null);
    const res = await fetch(`/api/ostrich/songs/${songId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    }).catch(() => null);
    if (!res?.ok) {
      setPending(undefined);
      setError("Couldn't save the color");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SONG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => pick(shown === c ? null : c)}
          title={colorName(c, labels)}
          aria-label={`Color: ${colorName(c, labels)}`}
          aria-pressed={shown === c}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
            shown === c
              ? 'border-[#E8E0D0]/60 bg-[#E8E0D0]/10 text-[#E8E0D0]'
              : 'border-transparent text-[#E8E0D0]/45 hover:border-[#E8E0D0]/25 hover:text-[#E8E0D0]/80'
          }`}
        >
          <ColorDot color={c} />
          {labels[c] && <span>{labels[c]}</span>}
        </button>
      ))}
      {error && <span className="text-[11px] text-[#F5A3A3]">{error}</span>}
    </div>
  );
}

// Filter chips for the song list, one per color in use or named, plus an
// inline editor for the names.
export function ColorLegend({
  workspaceId,
  labels,
  counts,
  active,
  onPick,
}: {
  workspaceId: number;
  labels: ColorLabels;
  // Songs per color, plus 'none' for uncolored.
  counts: Partial<Record<SongColor | 'none', number>>;
  active: SongColor | 'none' | null;
  onPick: (color: SongColor | 'none' | null) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ColorLabels>(labels);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ostrich/workspaces/${workspaceId}/colors`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels: draft }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError("Couldn't save the names");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-md border border-[#E8E0D0]/15 p-2">
        {SONG_COLORS.map((c) => (
          <label key={c} className="flex items-center gap-2">
            <ColorDot color={c} />
            <input
              type="text"
              value={draft[c] ?? ''}
              onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
              placeholder={colorName(c, {})}
              maxLength={40}
              className="min-w-0 flex-1 rounded border border-[#E8E0D0]/15 bg-transparent px-2 py-1 text-xs text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none"
            />
          </label>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded bg-[#E8E0D0] px-3 py-1 text-xs font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save names'}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(labels);
              setEditing(false);
            }}
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
          >
            Cancel
          </button>
          {error && <span className="text-[11px] text-[#F5A3A3]">{error}</span>}
        </div>
      </div>
    );
  }

  const shown = SONG_COLORS.filter((c) => labels[c] || counts[c]);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(active === c ? null : c)}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
            active === c
              ? 'border-[#E8E0D0]/60 bg-[#E8E0D0]/10 text-[#E8E0D0]'
              : 'border-[#E8E0D0]/15 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/35'
          }`}
        >
          <ColorDot color={c} />
          {colorName(c, labels)}
          <span className="text-[#E8E0D0]/35">{counts[c] ?? 0}</span>
        </button>
      ))}
      {(counts.none ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => onPick(active === 'none' ? null : 'none')}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition ${
            active === 'none'
              ? 'border-[#E8E0D0]/60 bg-[#E8E0D0]/10 text-[#E8E0D0]'
              : 'border-[#E8E0D0]/15 text-[#E8E0D0]/60 hover:border-[#E8E0D0]/35'
          }`}
        >
          <ColorDot color={null} />
          No color
          <span className="text-[#E8E0D0]/35">{counts.none}</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          setDraft(labels);
          setEditing(true);
        }}
        className="px-1 text-[11px] text-[#E8E0D0]/35 underline-offset-2 hover:text-[#E8E0D0] hover:underline"
      >
        name colors
      </button>
    </div>
  );
}

export function colorCounts(
  songs: Array<{ color: SongColor | null }>
): Partial<Record<SongColor | 'none', number>> {
  const counts: Partial<Record<SongColor | 'none', number>> = {};
  for (const s of songs) {
    const key = s.color ?? 'none';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
