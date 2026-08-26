'use client';

import { useEffect, useRef, useState } from 'react';

export interface DoorPersonMatch {
  id: number;
  name: string;
}

// Name typeahead for the show form's door-person field. Suggests
// previously-registered door people (so names don't get duplicated/typo'd) while
// still letting the operator type a brand-new one. Mirrors SoundEngineerNameInput.
export default function DoorPersonNameInput({
  value,
  onChange,
  onSelect,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (match: DoorPersonMatch) => void;
  className?: string;
  placeholder?: string;
}) {
  const [matches, setMatches] = useState<DoorPersonMatch[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) return; // render guards on query length too, so stale matches just stay unused
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/admin/door-persons?q=${encodeURIComponent(query)}`)
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
        </div>
      )}
    </div>
  );
}
