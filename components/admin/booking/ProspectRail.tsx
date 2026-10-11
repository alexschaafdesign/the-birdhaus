'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Section from '@/components/admin/Section';
import BandNameInput from '@/components/admin/BandNameInput';
import type { BandStanding, BookingProspect, DateHold } from '@/lib/booking';
import {
  BAND_STANDINGS,
  BAND_STANDING_COLORS,
  BAND_STANDING_LABELS,
  HOLD_STATUS_COLORS,
  HOLD_STATUS_LABELS,
  LIVE_HOLD_STATUSES,
  bandStanding,
} from '@/lib/booking';

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
  today,
  onAdd,
  onUpdate,
  onDelete,
  onSelectDate,
}: {
  prospects: BookingProspect[];
  holds: DateHold[];
  today: string;
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
  const [filter, setFilter] = useState<BandStanding | 'all'>('all');
  const [addName, setAddName] = useState('');
  const [addBandId, setAddBandId] = useState<number | null>(null);

  // Every date each band was asked about, soonest first, for the date chips.
  const holdsByProspect = useMemo(() => {
    const map = new Map<number, DateHold[]>();
    for (const h of holds) {
      const list = map.get(h.prospect_id) ?? [];
      list.push(h);
      map.set(h.prospect_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [holds]);

  const standingById = useMemo(() => {
    const map = new Map<number, BandStanding>();
    for (const p of prospects) {
      const upcomingLive = (holdsByProspect.get(p.id) ?? []).some(
        (h) => h.date >= today && LIVE_HOLD_STATUSES.includes(h.status)
      );
      map.set(p.id, bandStanding(p, upcomingLive));
    }
    return map;
  }, [prospects, holdsByProspect, today]);

  const counts = useMemo(() => {
    const map = new Map<BandStanding, number>();
    for (const standing of standingById.values()) map.set(standing, (map.get(standing) ?? 0) + 1);
    return map;
  }, [standingById]);

  // Active first, then wishlist, then not interested; priority within each.
  const visible = useMemo(
    () =>
      prospects
        .filter((p) => filter === 'all' || standingById.get(p.id) === filter)
        .sort(
          (a, b) =>
            BAND_STANDINGS.indexOf(standingById.get(a.id)!) - BAND_STANDINGS.indexOf(standingById.get(b.id)!) ||
            b.priority - a.priority ||
            b.updated_at.localeCompare(a.updated_at)
        ),
    [prospects, filter, standingById]
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
      <Section title="Add to wishlist">
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
              {addBandId !== null ? 'Linked to band directory' : 'Free-text band'}
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
        title="Bands"
        action={
          <span className="text-xs text-[#E8E0D0]/40">
            {visible.length} of {prospects.length}
          </span>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {BAND_STANDINGS.map((standing) => {
            const active = filter === standing;
            return (
              <button
                key={standing}
                onClick={() => setFilter(active ? 'all' : standing)}
                className="rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                style={{
                  borderColor: BAND_STANDING_COLORS[standing],
                  backgroundColor: active ? `${BAND_STANDING_COLORS[standing]}22` : 'transparent',
                  color: active ? BAND_STANDING_COLORS[standing] : '#E8E0D080',
                }}
              >
                {BAND_STANDING_LABELS[standing]}
                {(counts.get(standing) ?? 0) > 0 && <span className="opacity-60"> · {counts.get(standing)}</span>}
              </button>
            );
          })}
        </div>

        {visible.length === 0 && (
          <p className="text-xs text-[#E8E0D0]/30">
            {prospects.length === 0 ? 'No bands yet — add ones you want to book, or log who you asked on a date.' : 'Nothing matches this filter.'}
          </p>
        )}

        <ul className="space-y-3">
          {visible.map((prospect) => {
            const prospectHolds = holdsByProspect.get(prospect.id) ?? [];
            const standing = standingById.get(prospect.id) ?? 'wishlist';
            const notInterested = standing === 'not_interested';
            return (
              <li
                key={prospect.id}
                className={`rounded border border-[#E8E0D0]/15 p-3 ${notInterested ? 'opacity-60' : ''}`}
              >
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
                      if (window.confirm(`Delete prospect “${prospect.name}” and every date they were asked about?`)) {
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
                  <span
                    className="rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: BAND_STANDING_COLORS[standing], color: BAND_STANDING_COLORS[standing] }}
                  >
                    {BAND_STANDING_LABELS[standing]}
                  </span>

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

                  <button
                    onClick={() => onUpdate(prospect.id, { status: notInterested ? 'idea' : 'passed' })}
                    title={notInterested ? 'Move back to the wishlist' : 'Hide from quick-add; keeps their dates'}
                    className="rounded border border-[#E8E0D0]/20 px-2 py-1 text-xs text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
                  >
                    {notInterested ? '↺ wishlist' : 'Not interested'}
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
                        title={hold.note ?? undefined}
                        className={`rounded-full border px-2 py-0.5 text-xs hover:bg-[#E8E0D0]/10 ${
                          hold.status === 'passed' ? 'opacity-50' : ''
                        }`}
                        style={{ borderColor: `${HOLD_STATUS_COLORS[hold.status]}80`, color: HOLD_STATUS_COLORS[hold.status] }}
                      >
                        {formatShortDate(hold.date)} · {HOLD_STATUS_LABELS[hold.status]}
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
