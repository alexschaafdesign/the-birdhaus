'use client';

import { useEffect, useRef, useState } from 'react';

// The suggestion dropdown.
const MENU = 'absolute z-10 mt-1 w-full max-h-48 overflow-auto border border-surface-ink bg-surface-paper';
const ITEM = 'block w-full cursor-pointer text-left px-3 py-1.5 text-body-3 hover:bg-surface-paper-shade';

export interface SoundEngineerMatch {
  id: number;
  name: string;
}

// Name typeahead for the show form's sound-engineer fields. Suggests
// previously-used engineers (so names don't get duplicated/typo'd) while still
// letting the operator type a brand-new one. Mirrors BandNameInput.
export default function SoundEngineerNameInput({
  value,
  onChange,
  onSelect,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (match: SoundEngineerMatch) => void;
  className?: string;
  placeholder?: string;
}) {
  const [matches, setMatches] = useState<SoundEngineerMatch[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) return; // render guards on query length too, so stale matches just stay unused
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/sound-engineers?q=${encodeURIComponent(query)}`)
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
      {open && value.trim().length >= 2 && matches.length > 0 && (
        <div className={MENU}>
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
              className={ITEM}
            >
              {match.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
