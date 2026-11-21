'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AvailableDate } from '@/lib/available-dates';
import type { DateOfferStatus } from '@/lib/date-offers';
import type { BookingDay, BookingProspect } from '@/lib/booking';
import { FORM } from '@/components/night/form';
import { ADMIN_TYPE, buttonClassName } from '../ui';
import BookingCalendar from './BookingCalendar';
import BookingListView from './BookingListView';
import CalendarSubscribe from './CalendarSubscribe';
import DayPanel from './DayPanel';
import ProspectRail from './ProspectRail';

export interface BookingShow {
  id: number;
  slug: string;
  title: string;
  date: string;
  announced: boolean;
}

export interface BookingDateOffer {
  id: number;
  submission_id: number;
  date: string;
  status: DateOfferStatus;
  band_name: string;
}

// Everything the dashboard knows about one calendar day, in one lookup.
export interface DayInfo {
  date: string;
  show?: BookingShow;
  draftShow?: BookingShow;
  available?: AvailableDate;
  plan?: BookingDay;
  offers: BookingDateOffer[];
  // Notes of the blocks covering the whole day (master Calendar), if any.
  blocked?: string[];
}

// Timestamps arrive as Date objects from the server page (postgres.js parses
// timestamptz; RSC passes Dates through) but as ISO strings from the JSON API
// routes. Normalize to ISO strings so the wishlist's localeCompare sort works on both.
function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}

// bigint ids come over JSON as strings (see BandNameInput's coercion note) —
// normalize once so client-side equality checks are safe.
function normalizeProspect(p: BookingProspect): BookingProspect {
  return {
    ...p,
    id: Number(p.id),
    band_id: p.band_id == null ? null : Number(p.band_id),
    priority: Number(p.priority),
    last_contacted_at: p.last_contacted_at == null ? null : toIso(p.last_contacted_at),
    created_at: toIso(p.created_at),
    updated_at: toIso(p.updated_at),
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function BookingDashboard({
  today,
  initialProspects,
  initialDays,
  initialAvailableDates,
  dateOffers,
  shows: initialShows,
  feedUrl,
  initialDate = null,
  blockedDays,
}: {
  today: string;
  initialProspects: BookingProspect[];
  initialDays: BookingDay[];
  initialAvailableDates: AvailableDate[];
  dateOffers: BookingDateOffer[];
  shows: BookingShow[];
  feedUrl: string;
  // ?date= from the master calendar: open on that day with its panel showing.
  initialDate?: string | null;
  blockedDays: Record<string, string[]>;
}) {
  const [prospects, setProspects] = useState(() => initialProspects.map(normalizeProspect));
  const [days, setDays] = useState(() => new Map(initialDays.map((d) => [d.date, d])));
  const [availableDates, setAvailableDates] = useState(() =>
    initialAvailableDates.map((d) => ({ ...d, id: Number(d.id) }))
  );
  const [shows] = useState(() => initialShows.map((s) => ({ ...s, id: Number(s.id) })));
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [paintAvailability, setPaintAvailability] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const offers = useMemo(
    () => dateOffers.map((o) => ({ ...o, id: Number(o.id), submission_id: Number(o.submission_id) })),
    [dateOffers]
  );

  const dayInfoByDate = useMemo(() => {
    const map = new Map<string, DayInfo>();
    const get = (date: string): DayInfo => {
      let info = map.get(date);
      if (!info) {
        info = { date, offers: [] };
        map.set(date, info);
      }
      return info;
    };
    for (const s of shows) {
      const info = get(s.date);
      if (s.announced) info.show = info.show ?? s;
      else info.draftShow = info.draftShow ?? s;
    }
    for (const d of availableDates) get(d.date).available = d;
    for (const day of days.values()) get(day.date).plan = day;
    for (const o of offers) get(o.date).offers.push(o);
    for (const [date, notes] of Object.entries(blockedDays)) get(date).blocked = notes;
    return map;
  }, [shows, availableDates, days, offers, blockedDays]);

  // Future dates that carry anything — the agenda list's source.
  const agendaInfos = useMemo(
    () =>
      [...dayInfoByDate.values()]
        .filter((info) => info.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dayInfoByDate, today]
  );

  const selectedInfo: DayInfo | null = selectedDate
    ? dayInfoByDate.get(selectedDate) ?? { date: selectedDate, offers: [] }
    : null;

  async function resyncProspects() {
    try {
      const res = await fetch('/api/admin/booking/prospects');
      if (res.ok) setProspects((await res.json()).map(normalizeProspect));
    } catch {
      // the error banner already says something failed; a reload resyncs
    }
  }

  async function toggleAvailable(date: string) {
    const existing = availableDates.find((d) => d.date === date);
    if (existing) {
      setAvailableDates((prev) => prev.filter((d) => d.id !== existing.id));
      const res = await fetch(`/api/admin/available-dates/${existing.id}`, { method: 'DELETE' }).catch(() => null);
      if (!res?.ok) {
        setAvailableDates((prev) => [...prev, existing]);
        setErrorMessage('Failed to remove availability.');
      }
    } else {
      const res = await fetch('/api/admin/available-dates', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ date }),
      }).catch(() => null);
      if (res?.ok) {
        const row = await res.json();
        setAvailableDates((prev) => [...prev, { ...row, id: Number(row.id) }]);
      } else {
        setErrorMessage('Failed to mark the date available.');
      }
    }
  }

  async function addProspect(name: string, bandId: number | null) {
    const res = await fetch('/api/admin/booking/prospects', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, band_id: bandId }),
    }).catch(() => null);
    if (res?.status === 201) {
      const row = normalizeProspect(await res.json());
      setProspects((prev) => [row, ...prev]);
    } else {
      setErrorMessage('Failed to add the artist.');
    }
  }

  async function updateProspect(
    id: number,
    patch: Partial<Pick<BookingProspect, 'name' | 'band_id' | 'status' | 'priority' | 'notes'>> & {
      touch_contacted?: boolean;
    }
  ) {
    const optimistic = { ...patch };
    delete optimistic.touch_contacted; // server-computed; nothing to apply optimistically
    if (Object.keys(optimistic).length > 0) {
      setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...optimistic } : p)));
    }
    const res = await fetch(`/api/admin/booking/prospects/${id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const row = normalizeProspect(await res.json());
      setProspects((prev) => prev.map((p) => (p.id === id ? row : p)));
    } else {
      setErrorMessage('Failed to update the artist.');
      resyncProspects();
    }
  }

  async function deleteProspect(id: number) {
    setProspects((prev) => prev.filter((p) => p.id !== id));
    const res = await fetch(`/api/admin/booking/prospects/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setErrorMessage('Failed to delete the artist.');
      resyncProspects();
    }
  }

  // Optimistic: the calendar label follows the title as you type; the day
  // panel debounces the actual save. Returns whether the save landed.
  const saveDay = useCallback(async (date: string, title: string, notepad: string) => {
    setDays((prev) => {
      const next = new Map(prev);
      if (!title.trim() && !notepad.trim()) next.delete(date);
      else next.set(date, { date, title, notepad });
      return next;
    });
    const res = await fetch('/api/admin/booking/days', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ date, title, notepad }),
    }).catch(() => null);
    if (!res?.ok) setErrorMessage('Failed to save that day — copy your text somewhere before reloading.');
    return Boolean(res?.ok);
  }, []);

  return (
    <div>
      {errorMessage && (
        <div role="alert" className={`${FORM.error} mb-4 flex items-center justify-between gap-3`}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className={ADMIN_TYPE.link}>
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(['calendar', 'list'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={`${buttonClassName(view === option ? 'primary' : 'secondary', 's')} uppercase`}
          >
            {option}
          </button>
        ))}
        {view === 'calendar' && (
          <button
            type="button"
            onClick={() => setPaintAvailability((prev) => !prev)}
            aria-pressed={paintAvailability}
            className={`ml-2 ${buttonClassName(paintAvailability ? 'primary' : 'secondary', 's')}`}
          >
            ✎ mark available
          </button>
        )}
        <CalendarSubscribe initialUrl={feedUrl} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'calendar' ? (
            <BookingCalendar
              dayInfoByDate={dayInfoByDate}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
              paintMode={paintAvailability}
              onPaintDay={toggleAvailable}
            />
          ) : (
            <BookingListView
              infos={agendaInfos}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
            />
          )}
        </div>

        {/* Day panel sits above the rail so a clicked day's details land at
            eye level next to the calendar, not below the fold. */}
        <div className="min-w-0 space-y-4">
          {selectedInfo && (
            <DayPanel
              key={selectedInfo.date}
              info={selectedInfo}
              onClose={() => setSelectedDate(null)}
              onToggleAvailable={toggleAvailable}
              onSave={saveDay}
            />
          )}
          <ProspectRail
            prospects={prospects}
            days={days}
            today={today}
            onAdd={addProspect}
            onUpdate={updateProspect}
            onDelete={deleteProspect}
            onSelectDate={(date) => {
              setView('calendar');
              setSelectedDate(date);
            }}
          />
        </div>
      </div>
    </div>
  );
}
