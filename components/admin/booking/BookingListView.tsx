'use client';

import { useMemo } from 'react';
import { DATE_OFFER_SWATCH } from '@/lib/date-offers';
import { Swatch, ADMIN_TYPE } from '@/components/admin/ui';
import type { DayInfo } from './BookingDashboard';

function parseLocalDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Agenda counterpart to the calendar: every future date that carries anything
// (show, draft, availability, title/notepad, offers), chronological, grouped
// by month. Rows select the date, opening the same DayPanel.
export default function BookingListView({
  infos,
  selectedDate,
  onSelectDate,
}: {
  infos: DayInfo[];
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
      <div className=" border border-surface-ink p-6 text-body-3 text-surface-ink/60">
        Nothing planned yet — switch to the calendar to mark available dates and jot down ideas.
      </div>
    );
  }

  return (
    <div className=" border border-surface-ink p-4 sm:p-6">
      {groups.map(([monthKey, monthInfos]) => {
        const monthDate = parseLocalDate(`${monthKey}-01`);
        return (
          <div key={monthKey} className="mb-2">
            <h3 className={`${ADMIN_TYPE.overline} sticky top-0 z-10 -mx-1 bg-surface-paper px-1 py-2 text-surface-ink/60`}>
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
                      className={`flex w-full items-start gap-3 border-b border-surface-ink/20 px-1 py-2.5 text-left transition-colors hover:bg-surface-paper-shade ${
                        isSelected ? 'bg-spectrum-amber/40' : ''
                      }`}
                    >
                      <span className="w-16 shrink-0 pt-0.5  text-data-caption-13 text-surface-ink/60">
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}{' '}
                        <span className="font-bold text-surface-ink/80">{day.getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        {info.show && (
                          <span className="block truncate text-body-3 font-bold">{info.show.title}</span>
                        )}
                        {info.draftShow && !info.show && (
                          <span className="block truncate text-body-3 text-surface-ink">
                            {info.draftShow.title} <span className="text-data-caption-13 uppercase">draft</span>
                          </span>
                        )}
                        {info.plan?.title && !info.show && !info.draftShow && (
                          <span className="block truncate text-body-3 font-bold">{info.plan.title}</span>
                        )}
                        {info.blocked && (
                          <span className="block text-data-caption-13 text-accent-red">
                            Blocked{info.blocked.length ? `: ${info.blocked.join(' · ')}` : ''}
                          </span>
                        )}
                        {info.available && !info.show && !info.draftShow && (
                          <span className="block text-data-caption-13 text-surface-ink">Available</span>
                        )}
                        {info.offers.length > 0 && (
                          <span className="block truncate text-data-caption-13">
                            {info.offers.map((offer, i) => (
                              <span key={offer.id} className="inline-flex items-center gap-1">
                                {i > 0 && ' · '}
                                <Swatch className={DATE_OFFER_SWATCH[offer.status]} />
                                Offered: {offer.band_name}
                              </span>
                            ))}
                          </span>
                        )}
                        {info.plan?.notepad.trim() && (
                          <span className="block truncate text-data-caption-13 text-surface-ink/60">
                            {info.plan.notepad.trim().split('\n').filter(Boolean).join(' · ')}
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
