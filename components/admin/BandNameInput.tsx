'use client';

import { useEffect, useRef, useState } from 'react';

export interface BandMatch {
  id: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
}

// A band from Twin Scene's directory that ShowForm fetched once for the
// whole form session — see /api/admin/bands/twinscene and ShowForm.tsx.
export interface TwinSceneBandOption {
  twinSceneId: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
}

// One dropdown row: either a real local match, or a Twin-Scene-only result
// with no local bands row yet (id is null until the operator picks it and
// the JIT sync in handleSelect resolves a real id).
interface DisplayMatch {
  id: number | null;
  twinSceneId?: number;
  name: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
}

export default function BandNameInput({
  value,
  onChange,
  onSelect,
  onAddNew,
  twinSceneBands,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (match: BandMatch) => void;
  // When provided, an "Add <name> as a new band" row appears at the bottom of
  // the dropdown whenever the typed name has no exact match — opens the full
  // Add Band modal (see ShowForm/AddBandModal).
  onAddNew?: (name: string) => void;
  twinSceneBands?: TwinSceneBandOption[];
  className?: string;
  placeholder?: string;
}) {
  const [matches, setMatches] = useState<(BandMatch & { twinSceneId?: number })[]>([]);
  const [open, setOpen] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) return; // render guards on query length too, so stale matches just stay unused
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/bands?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : []))
        // bands.id is bigserial, so the postgres driver serializes it as a string over JSON —
        // coerce back to a number here so it matches the BandMatch type everywhere downstream.
        .then((data) =>
          setMatches(
            Array.isArray(data)
              ? data.map((m) => ({
                  ...m,
                  id: Number(m.id),
                  twinSceneId: m.twin_scene_band_id != null ? Number(m.twin_scene_band_id) : undefined,
                }))
              : []
          )
        )
        .catch(() => {
          // typeahead is best-effort; a failed lookup just means no suggestions
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const query = value.trim().toLowerCase();
  // Any Twin Scene band already represented among the local matches (i.e.
  // already synced) shows once, as the local result — not duplicated.
  const syncedTwinSceneIds = new Set(matches.map((m) => m.twinSceneId).filter((id): id is number => id != null));
  const twinSceneOnlyMatches: DisplayMatch[] =
    query.length >= 2
      ? (twinSceneBands ?? [])
          .filter((b) => !syncedTwinSceneIds.has(b.twinSceneId) && b.name.toLowerCase().includes(query))
          .slice(0, 8)
          .map((b) => ({
            id: null,
            twinSceneId: b.twinSceneId,
            name: b.name,
            instagram: b.instagram,
            bio: b.bio,
            photo: b.photo,
          }))
      : [];
  const displayMatches: DisplayMatch[] = [...matches, ...twinSceneOnlyMatches];
  // Offer "add new" only when nothing in the dropdown is an exact name match —
  // an exact match means the band already exists and should just be picked.
  const trimmed = value.trim();
  const hasExactMatch = displayMatches.some((m) => m.name.trim().toLowerCase() === query);
  const showAddNew = !!onAddNew && trimmed.length >= 2 && !hasExactMatch;

  // Local match: select immediately, as before. Twin-Scene-only match: sync
  // it into Birdhaus's local bands table first so it gets a real bandId,
  // then select the resolved result. Best-effort — a failed sync just leaves
  // the dropdown open so the operator can retry or pick something else.
  function handleSelect(match: DisplayMatch) {
    if (match.id !== null) {
      onSelect({ id: match.id, name: match.name, instagram: match.instagram, bio: match.bio, photo: match.photo });
      setOpen(false);
      return;
    }
    if (syncingId !== null || match.twinSceneId == null) return;

    setSyncingId(match.twinSceneId);
    fetch('/api/admin/bands/twinscene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ twinSceneId: match.twinSceneId }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`sync failed: ${res.status}`))))
      .then((synced) => {
        onSelect({ ...synced, id: Number(synced.id) });
        setOpen(false);
      })
      .catch(() => {
        // leave the dropdown open — operator can retry the same row
      })
      .finally(() => setSyncingId(null));
  }

  return (
    <div className="relative">
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={className}
        autoComplete="off"
      />
      {open && trimmed.length >= 2 && (displayMatches.length > 0 || showAddNew) && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded border border-[#E8E0D0]/30 bg-[#171412] shadow-lg">
          {displayMatches.map((match) => (
            <button
              key={match.id ?? `ts-${match.twinSceneId}`}
              type="button"
              disabled={syncingId !== null}
              // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(match);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-50"
            >
              <span className="font-medium">{match.name}</span>
              {match.instagram && <span className="text-[#E8E0D0]/40 ml-2 text-xs">{match.instagram}</span>}
              {match.id === null && (
                <span className="text-[#E8E0D0]/40 ml-2 text-xs italic">
                  {syncingId === match.twinSceneId ? 'linking…' : 'Twin Scene'}
                </span>
              )}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onAddNew!(trimmed);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-[#E8E0D0]/70 border-t border-[#E8E0D0]/10 hover:bg-[#E8E0D0]/10"
            >
              ＋ Add “{trimmed}” as a new band
            </button>
          )}
        </div>
      )}
    </div>
  );
}
