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
      ? 'text-data-caption-13 text-surface-ink/60 w-10 flex-shrink-0'
      : 'text-body-3 text-surface-ink/60 w-12 flex-shrink-0';
  const buttonClass =
    size === 'sm'
      ? 'text-data-caption-13 border border-surface-ink px-2 py-1 cursor-pointer hover:bg-surface-paper-shade'
      : 'text-body-3 border border-surface-ink px-3 py-1.5 cursor-pointer hover:bg-surface-paper-shade';
  const removeClass = size === 'sm' ? 'text-accent-red cursor-pointer hover:underline text-data-caption-13' : 'text-accent-red cursor-pointer hover:underline text-body-3';
  const sepClass = size === 'sm' ? 'text-surface-ink/60 text-body-3' : 'text-surface-ink/60';
  const emptyClass = size === 'sm' ? 'text-data-caption-13 text-surface-ink/60' : 'text-body-3 text-surface-ink/60';

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
                aria-label="Start date"
                value={entry.from}
                onChange={(e) => {
                  const from = e.target.value;
                  // An empty (or now-earlier) end follows the start, so the end
                  // picker opens on the start's month instead of today's.
                  const to = from && (!entry.to || entry.to < from) ? from : entry.to;
                  updateEntry(i, { ...entry, from, to });
                }}
                className={inputClassName}
              />
              <span className={sepClass}>to</span>
              <input
                type="date"
                aria-label="End date"
                value={entry.to}
                min={entry.from || undefined}
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
