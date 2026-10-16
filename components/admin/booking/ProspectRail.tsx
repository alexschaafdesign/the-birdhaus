'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Section from '@/components/admin/Section';
import BandNameInput from '@/components/admin/BandNameInput';
import type { BookingDay, BookingProspect } from '@/lib/booking';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatShortDate(dateStr: string) {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Whole-word, case-insensitive: "Fend" matches "Fend - asked" but not "Fender".
function mentionPattern(name: string) {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu');
}

// The artist wishlist (table: booking_prospects). Each card links back to
// the days whose title or notepad mentions the artist by name.
export default function ProspectRail({
  prospects,
  days,
  today,
  onAdd,
  onUpdate,
  onDelete,
  onSelectDate,
}: {
  prospects: BookingProspect[];
  days: Map<string, BookingDay>;
  today: string;
  onAdd: (name: string, bandId: number | null) => void;
  onUpdate: (id: number, patch: Partial<Pick<BookingProspect, 'priority' | 'notes'>>) => void;
  onDelete: (id: number) => void;
  onSelectDate: (date: string) => void;
}) {
  const [addName, setAddName] = useState('');
  const [addBandId, setAddBandId] = useState<number | null>(null);

  const mentionsById = useMemo(() => {
    const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<number, string[]>();
    for (const p of prospects) {
      if (!p.name.trim()) continue;
      const pattern = mentionPattern(p.name);
      map.set(
        p.id,
        sortedDays.filter((d) => pattern.test(`${d.title}\n${d.notepad}`)).map((d) => d.date)
      );
    }
    return map;
  }, [prospects, days]);

  const visible = useMemo(
    () => [...prospects].sort((a, b) => b.priority - a.priority || b.updated_at.localeCompare(a.updated_at)),
    [prospects]
  );

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = addName.trim();
    if (!name) return;
    onAdd(name, addBandId);
    setAddName('');
    setAddBandId(null);
  }

  return (
    <div className="min-w-0 space-y-4">
      <Section
        title="Wishlist"
        action={<span className="text-xs text-[#E8E0D0]/40">{prospects.length} artists</span>}
      >
        <form onSubmit={handleAdd} className="mb-4 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <BandNameInput
              value={addName}
              onChange={(value) => {
                setAddName(value);
                // Free typing after a pick means the text no longer matches the
                // linked artist — drop the link and keep it name-only.
                setAddBandId(null);
              }}
              onSelect={(match) => {
                setAddName(match.name);
                setAddBandId(match.id);
              }}
              className={`${inputClass} w-full`}
              placeholder="Artist you’d love to book…"
            />
          </div>
          <button
            type="submit"
            disabled={!addName.trim()}
            className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
          >
            + Add
          </button>
        </form>

        {visible.length === 0 && (
          <p className="text-xs text-[#E8E0D0]/30">No artists yet — add the ones you want here someday.</p>
        )}

        <ul className="space-y-3">
          {visible.map((prospect) => {
            const mentions = mentionsById.get(prospect.id) ?? [];
            return (
              <li key={prospect.id} className="rounded border border-[#E8E0D0]/15 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold">{prospect.name}</span>
                    {prospect.band_id !== null && (
                      <Link
                        href={`/admin/bands/${prospect.band_id}`}
                        className="ml-2 text-xs text-[#E8E0D0]/40 hover:text-[#E8E0D0] hover:underline"
                      >
                        artist ↗
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-[#E8E0D0]/50">
                    <button
                      onClick={() => onUpdate(prospect.id, { priority: prospect.priority + 1 })}
                      title="Raise priority"
                      className="rounded border border-[#E8E0D0]/20 px-1.5 hover:bg-[#E8E0D0]/10"
                    >
                      ▲
                    </button>
                    <span className="w-4 text-center font-mono">{prospect.priority}</span>
                    <button
                      onClick={() => onUpdate(prospect.id, { priority: prospect.priority - 1 })}
                      title="Lower priority"
                      className="rounded border border-[#E8E0D0]/20 px-1.5 hover:bg-[#E8E0D0]/10"
                    >
                      ▼
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove “${prospect.name}” from the wishlist?`)) onDelete(prospect.id);
                      }}
                      aria-label={`Remove ${prospect.name}`}
                      className="ml-1 px-1 text-[#E8E0D0]/30 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {mentions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-[#E8E0D0]/40">Mentioned on</span>
                    {mentions.map((date) => (
                      <button
                        key={date}
                        onClick={() => onSelectDate(date)}
                        className={`rounded-full border border-[#E8E0D0]/25 px-2 py-0.5 text-xs text-[#E8E0D0]/80 hover:bg-[#E8E0D0]/10 ${
                          date < today ? 'opacity-50' : ''
                        }`}
                      >
                        {formatShortDate(date)}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  key={`${prospect.id}-${prospect.updated_at}`}
                  defaultValue={prospect.notes}
                  placeholder="Notes…"
                  rows={1}
                  onBlur={(e) => {
                    const notes = e.target.value;
                    if (notes !== prospect.notes) onUpdate(prospect.id, { notes });
                  }}
                  className={`${inputClass} mt-2 w-full resize-y text-xs`}
                />
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
