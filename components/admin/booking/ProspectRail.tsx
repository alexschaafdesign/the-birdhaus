'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Section from '@/components/admin/Section';
import BandNameInput from '@/components/admin/BandNameInput';
import type { BookingProspect, DateHold, ProspectStatus } from '@/lib/booking';
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS, PROSPECT_STATUS_COLORS } from '@/lib/booking';

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

export default function ProspectRail({
  prospects,
  holds,
  onAdd,
  onUpdate,
  onDelete,
  onSelectDate,
}: {
  prospects: BookingProspect[];
  holds: DateHold[];
  onAdd: (name: string, bandId: number | null) => void;
  onUpdate: (
    id: number,
    patch: Partial<Pick<BookingProspect, 'name' | 'band_id' | 'status' | 'priority' | 'notes'>> & {
      touch_contacted?: boolean;
    }
  ) => void;
  onDelete: (id: number) => void;
  onSelectDate: (date: string) => void;
}) {
  const [filter, setFilter] = useState<ProspectStatus | 'all'>('all');
  const [addName, setAddName] = useState('');
  const [addBandId, setAddBandId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const map = new Map<ProspectStatus, number>();
    for (const p of prospects) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return map;
  }, [prospects]);

  // Pending holds per prospect, soonest first, for the held-date chips.
  const pendingHoldsByProspect = useMemo(() => {
    const map = new Map<number, DateHold[]>();
    for (const h of holds) {
      if (h.status !== 'pending') continue;
      const list = map.get(h.prospect_id) ?? [];
      list.push(h);
      map.set(h.prospect_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [holds]);

  const visible = useMemo(
    () =>
      prospects
        .filter((p) => filter === 'all' || p.status === filter)
        .sort((a, b) => b.priority - a.priority || b.updated_at.localeCompare(a.updated_at)),
    [prospects, filter]
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
      <Section title="Add prospect">
        <form onSubmit={handleAdd} className="space-y-2">
          <BandNameInput
            value={addName}
            onChange={(value) => {
              setAddName(value);
              // Free typing after a pick means the text no longer matches the
              // linked band — drop the link and treat it as a name-only prospect.
              setAddBandId(null);
            }}
            onSelect={(match) => {
              setAddName(match.name);
              setAddBandId(match.id);
            }}
            className={`${inputClass} w-full`}
            placeholder="Band name (links to directory if it matches)…"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#E8E0D0]/40">
              {addBandId !== null ? 'Linked to band directory' : 'Free-text prospect'}
            </span>
            <button
              type="submit"
              disabled={!addName.trim()}
              className="rounded border border-[#E8E0D0]/30 px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 disabled:opacity-40"
            >
              + Add
            </button>
          </div>
        </form>
      </Section>

      <Section
        title="Prospects"
        action={
          <span className="text-xs text-[#E8E0D0]/40">
            {visible.length} of {prospects.length}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PROSPECT_STATUSES.map((status) => {
            const active = filter === status;
            return (
              <button
                key={status}
                onClick={() => setFilter(active ? 'all' : status)}
                className="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                style={{
                  borderColor: PROSPECT_STATUS_COLORS[status],
                  backgroundColor: active ? `${PROSPECT_STATUS_COLORS[status]}22` : 'transparent',
                  color: active ? PROSPECT_STATUS_COLORS[status] : '#E8E0D080',
                }}
              >
                {PROSPECT_STATUS_LABELS[status]}
                {(counts.get(status) ?? 0) > 0 && <span className="opacity-60"> · {counts.get(status)}</span>}
              </button>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className="text-xs text-[#E8E0D0]/30">
            {prospects.length === 0 ? 'No prospects yet — add the bands you want to chase.' : 'Nothing matches this filter.'}
          </p>
        )}

        <ul className="space-y-3">
          {visible.map((prospect) => {
            const prospectHolds = pendingHoldsByProspect.get(prospect.id) ?? [];
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
                        band ↗
                      </Link>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete prospect “${prospect.name}” and their holds?`)) {
                        onDelete(prospect.id);
                      }
                    }}
                    aria-label={`Delete ${prospect.name}`}
                    className="px-1 text-[#E8E0D0]/30 hover:text-red-400"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={prospect.status}
                    onChange={(e) => onUpdate(prospect.id, { status: e.target.value as ProspectStatus })}
                    className="rounded border bg-[#171412] px-2 py-1 text-xs focus:outline-none"
                    style={{
                      borderColor: PROSPECT_STATUS_COLORS[prospect.status],
                      color: PROSPECT_STATUS_COLORS[prospect.status],
                    }}
                  >
                    {PROSPECT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {PROSPECT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>

                  <span className="flex items-center gap-1 text-xs text-[#E8E0D0]/50">
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
                  </span>

                  <button
                    onClick={() => onUpdate(prospect.id, { touch_contacted: true })}
                    title="Log that you contacted them today"
                    className="rounded border border-[#E8E0D0]/20 px-2 py-1 text-xs text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
                  >
                    ☎ today
                  </button>
                </div>

                {prospect.last_contacted_at && (
                  <p className="mt-1.5 text-xs text-[#E8E0D0]/40">
                    Last contact {new Date(prospect.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )}

                {prospectHolds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prospectHolds.map((hold) => (
                      <button
                        key={hold.id}
                        onClick={() => onSelectDate(hold.date)}
                        className="rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-400/90 hover:bg-amber-500/10"
                      >
                        H{hold.position} · {formatShortDate(hold.date)}
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
