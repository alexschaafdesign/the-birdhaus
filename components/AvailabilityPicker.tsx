'use client';

import type { AvailabilityEntry } from '@/lib/submissions';

// Shared date/range list editor: used by the public show-request form to collect
// availability, and by the admin board to edit it. Both render the same "date" or
// "range" rows with add/remove controls; only sizing differs per context.
export default function AvailabilityPicker({
  entries,
  onChange,
  inputClassName,
  size = 'sm',
}: {
  entries: AvailabilityEntry[];
  onChange: (entries: AvailabilityEntry[]) => void;
  inputClassName: string;
  size?: 'sm' | 'md';
}) {
  function updateEntry(index: number, entry: AvailabilityEntry) {
    onChange(entries.map((e, i) => (i === index ? entry : e)));
  }
  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  const labelClass =
    size === 'sm'
      ? 'text-xs text-[#E8E0D0]/40 w-10 flex-shrink-0'
      : 'text-sm text-[#E8E0D0]/50 w-12 flex-shrink-0';
  const buttonClass =
    size === 'sm'
      ? 'text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10'
      : 'text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10';
  const removeClass = size === 'sm' ? 'text-red-400/70 hover:text-red-400 text-xs' : 'text-red-400/70 hover:text-red-400 text-sm';
  const sepClass = size === 'sm' ? 'text-[#E8E0D0]/40 text-sm' : 'text-[#E8E0D0]/40';
  const emptyClass = size === 'sm' ? 'text-xs text-[#E8E0D0]/30' : 'text-sm text-[#E8E0D0]/40';

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className={labelClass}>{entry.type === 'date' ? 'date' : 'range'}</span>
          {entry.type === 'date' ? (
            <input
              type="date"
              value={entry.value}
              onChange={(e) => updateEntry(i, { type: 'date', value: e.target.value })}
              className={inputClassName}
            />
          ) : (
            <>
              <input
                type="date"
                value={entry.from}
                onChange={(e) => updateEntry(i, { ...entry, from: e.target.value })}
                className={inputClassName}
              />
              <span className={sepClass}>to</span>
              <input
                type="date"
                value={entry.to}
                onChange={(e) => updateEntry(i, { ...entry, to: e.target.value })}
                className={inputClassName}
              />
            </>
          )}
          <button type="button" onClick={() => removeEntry(i)} className={removeClass}>
            remove
          </button>
        </div>
      ))}
      {entries.length === 0 && <p className={emptyClass}>No dates added yet.</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...entries, { type: 'date', value: '' }])}
          className={buttonClass}
        >
          + date
        </button>
        <button
          type="button"
          onClick={() => onChange([...entries, { type: 'range', from: '', to: '' }])}
          className={buttonClass}
        >
          + range
        </button>
      </div>
    </div>
  );
}
