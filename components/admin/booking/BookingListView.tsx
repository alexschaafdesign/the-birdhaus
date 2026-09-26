'use client';

import { useMemo } from 'react';
import { DATE_OFFER_COLORS } from '@/lib/date-offers';
import type { BookingProspect } from '@/lib/booking';
import type { DayInfo } from './BookingDashboard';

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Agenda counterpart to the calendar: every future date that carries anything
// (show, draft, availability, holds, notes, offers), chronological, grouped
// by month. Rows select the date, opening the same DayPanel.
export default function BookingListView({
  infos,
  prospectsById,
  selectedDate,
  onSelectDate,
}: {
  infos: DayInfo[];
  prospectsById: Map<number, BookingProspect>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const groups = useMemo(() => {
    const byMonth = new Map<string, DayInfo[]>();
    for (const info of infos) {
      const key = info.date.slice(0, 7);
      const list = byMonth.get(key) ?? [];
      list.push(info);
      byMonth.set(key, list);
    }
    return [...byMonth.entries()];
  }, [infos]);

  if (infos.length === 0) {
    return (
      <div className="rounded-lg border border-[#E8E0D0]/20 p-6 text-sm text-[#E8E0D0]/40">
        Nothing planned yet — switch to the calendar to mark available dates and add holds.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#E8E0D0]/20 p-4 sm:p-6">
      {groups.map(([monthKey, monthInfos]) => {
        const monthDate = parseLocalDate(`${monthKey}-01`);
        return (
          <div key={monthKey} className="mb-2">
            <h3 className="sticky top-0 z-10 -mx-1 bg-[#171412] px-1 py-2 font-mono text-xs uppercase tracking-widest text-[#E8E0D0]/50">
              {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <ul>
              {monthInfos.map((info) => {
                const day = parseLocalDate(info.date);
                const isSelected = info.date === selectedDate;
                return (
                  <li key={info.date}>
                    <button
                      onClick={() => onSelectDate(info.date)}
                      className={`flex w-full items-start gap-3 border-b border-[#E8E0D0]/10 px-1 py-2.5 text-left transition-colors hover:bg-[#E8E0D0]/5 ${
                        isSelected ? 'bg-yellow-400/10' : ''
                      }`}
                    >
                      <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-[#E8E0D0]/60">
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                        <span className="font-bold text-[#E8E0D0]/90">{day.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        {info.show && (
                          <span className="block truncate text-sm font-medium">{info.show.title}</span>
                        )}
                        {info.draftShow && !info.show && (
                          <span className="block truncate text-sm text-yellow-400/90">
                            {info.draftShow.title} <span className="text-xs uppercase">draft</span>
                          </span>
                        )}
                        {info.available && !info.show && !info.draftShow && (
                          <span className="block text-xs text-green-400/90">Available</span>
                        )}
                        {info.pendingHolds.length > 0 && (
                          <span className="block truncate text-xs text-amber-400/90">
                            {info.pendingHolds
                              .map((h) => `H${h.position} ${prospectsById.get(h.prospect_id)?.name ?? '?'}`)
                              .join(' · ')}
                          </span>
                        )}
                        {info.offers.length > 0 && (
                          <span className="block truncate text-xs">
                            {info.offers.map((offer, i) => (
                              <span key={offer.id} style={{ color: DATE_OFFER_COLORS[offer.status] }}>
                                {i > 0 && ' · '}
                                Offered: {offer.band_name}
                              </span>
                            ))}
                          </span>
                        )}
                        {info.notes.length > 0 && (
                          <span className="block truncate text-xs text-[#E8E0D0]/50">
                            {info.notes.map((n) => n.body).join(' · ')}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
