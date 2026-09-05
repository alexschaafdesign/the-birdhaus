'use client';

import { useEffect, useRef, useState } from 'react';

export interface PhotographerMatch {
  id: number;
  name: string;
}

// Name typeahead for crediting show photos to a photographer. Suggests
// photographers already in the registry (so names don't get duplicated/typo'd),
// and offers a "+ Add" row that creates a new registry entry inline (name only —
// the full profile can be filled in later under Admin → Photographers). Mirrors
// SoundEngineerNameInput, but resolves selections/creations to a registry id
// via onSelect since per-photo credits are stored by id.
export default function PhotographerNameInput({
  value,
  onChange,
  onSelect,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (match: PhotographerMatch) => void;
  className?: string;
  placeholder?: string;
}) {
  const [matches, setMatches] = useState<PhotographerMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/photographers?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) =>
          setMatches(Array.isArray(data) ? data.map((m) => ({ ...m, id: Number(m.id) })) : [])
        )
        .catch(() => {
          // typeahead is best-effort; a failed lookup just means no suggestions
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const trimmed = value.trim();
  const hasExactMatch = matches.some((m) => m.name.toLowerCase() === trimmed.toLowerCase());

  async function createNew() {
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/admin/photographers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.id) {
        onSelect({ id: Number(body.id), name: trimmed });
        setOpen(false);
      }
    } catch {
      // best-effort; leave the field as typed if the create fails
    } finally {
      setCreating(false);
    }
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
      {open && trimmed.length >= 2 && (matches.length > 0 || !hasExactMatch) && (
        <div className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded border border-[#E8E0D0]/30 bg-[#171412] shadow-lg">
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              // onMouseDown (not onClick) fires before the input's onBlur closes the dropdown.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(match);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10"
            >
              {match.name}
            </button>
          ))}
          {!hasExactMatch && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                createNew();
              }}
              className="block w-full text-left px-3 py-1.5 text-sm italic text-[#E8E0D0]/70 hover:bg-[#E8E0D0]/10"
            >
              {creating ? 'Adding…' : `+ Add “${trimmed}” as a new photographer`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
