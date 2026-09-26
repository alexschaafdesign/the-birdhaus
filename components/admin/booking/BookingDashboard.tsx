'use client';

import { useMemo, useState } from 'react';
import type { AvailableDate } from '@/lib/available-dates';
import type { DateOfferStatus } from '@/lib/date-offers';
import type { BookingProspect, DateHold, DateNote, ProspectStatus } from '@/lib/booking';
import BookingCalendar from './BookingCalendar';
import BookingListView from './BookingListView';
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
  pendingHolds: DateHold[];
  otherHolds: DateHold[];
  notes: DateNote[];
  offers: BookingDateOffer[];
}

// bigint ids come over JSON as strings (see BandNameInput's coercion note) —
// normalize once so client-side equality checks are safe.
function normalizeProspect(p: BookingProspect): BookingProspect {
  return {
    ...p,
    id: Number(p.id),
    band_id: p.band_id == null ? null : Number(p.band_id),
    priority: Number(p.priority),
  };
}

function normalizeHold(h: DateHold): DateHold {
  return {
    ...h,
    id: Number(h.id),
    prospect_id: Number(h.prospect_id),
    position: Number(h.position),
    show_id: h.show_id == null ? null : Number(h.show_id),
  };
}

function normalizeNote(n: DateNote): DateNote {
  return { ...n, id: Number(n.id) };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export default function BookingDashboard({
  today,
  initialProspects,
  initialHolds,
  initialDateNotes,
  initialAvailableDates,
  dateOffers,
  shows: initialShows,
}: {
  today: string;
  initialProspects: BookingProspect[];
  initialHolds: DateHold[];
  initialDateNotes: DateNote[];
  initialAvailableDates: AvailableDate[];
  dateOffers: BookingDateOffer[];
  shows: BookingShow[];
}) {
  const [prospects, setProspects] = useState(() => initialProspects.map(normalizeProspect));
  const [holds, setHolds] = useState(() => initialHolds.map(normalizeHold));
  const [dateNotes, setDateNotes] = useState(() => initialDateNotes.map(normalizeNote));
  const [availableDates, setAvailableDates] = useState(() =>
    initialAvailableDates.map((d) => ({ ...d, id: Number(d.id) }))
  );
  const [shows, setShows] = useState(() => initialShows.map((s) => ({ ...s, id: Number(s.id) })));
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
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
        info = { date, pendingHolds: [], otherHolds: [], notes: [], offers: [] };
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
    for (const h of holds) {
      const info = get(h.date);
      (h.status === 'pending' ? info.pendingHolds : info.otherHolds).push(h);
    }
    for (const n of dateNotes) get(n.date).notes.push(n);
    for (const o of offers) get(o.date).offers.push(o);
    for (const info of map.values()) {
      info.pendingHolds.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [shows, availableDates, holds, dateNotes, offers]);

  const prospectsById = useMemo(() => {
    const map = new Map<number, BookingProspect>();
    for (const p of prospects) map.set(p.id, p);
    return map;
  }, [prospects]);

  // Future dates that carry anything — the agenda list's source.
  const agendaInfos = useMemo(
    () =>
      [...dayInfoByDate.values()]
        .filter((info) => info.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [dayInfoByDate, today]
  );

  const selectedInfo: DayInfo | null = selectedDate
    ? dayInfoByDate.get(selectedDate) ?? {
        date: selectedDate,
        pendingHolds: [],
        otherHolds: [],
        notes: [],
        offers: [],
      }
    : null;

  // Replace one date's ladder wholesale with what the server returned after a
  // hold mutation — positions are server-assigned, so no client-side guessing.
  function replaceDateHolds(date: string, next: DateHold[]) {
    setHolds((prev) => [...prev.filter((h) => h.date !== date), ...next.map(normalizeHold)]);
  }

  async function resyncHolds() {
    try {
      const res = await fetch('/api/admin/booking/holds');
      if (res.ok) setHolds((await res.json()).map(normalizeHold));
    } catch {
      // banner already tells the operator something failed; a reload resyncs
    }
  }

  async function resyncProspects() {
    try {
      const res = await fetch('/api/admin/booking/prospects');
      if (res.ok) setProspects((await res.json()).map(normalizeProspect));
    } catch {
      // see resyncHolds
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
      setErrorMessage('Failed to add prospect.');
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
      setErrorMessage('Failed to update prospect.');
      resyncProspects();
    }
  }

  async function deleteProspect(id: number) {
    setProspects((prev) => prev.filter((p) => p.id !== id));
    setHolds((prev) => prev.filter((h) => h.prospect_id !== id));
    const res = await fetch(`/api/admin/booking/prospects/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setErrorMessage('Failed to delete prospect.');
      resyncProspects();
      resyncHolds();
    }
  }

  async function addHold(date: string, prospectId: number) {
    const res = await fetch('/api/admin/booking/holds', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ date, prospect_id: prospectId }),
    }).catch(() => null);
    if (res?.status === 201) {
      const { hold, prospect } = await res.json();
      setHolds((prev) => [...prev, normalizeHold(hold)]);
      const row = normalizeProspect(prospect);
      setProspects((prev) => prev.map((p) => (p.id === row.id ? row : p)));
    } else if (res?.status === 409) {
      setErrorMessage('That prospect already holds this date.');
    } else {
      setErrorMessage('Failed to add hold.');
    }
  }

  async function patchHold(hold: DateHold, patch: Record<string, unknown>, failureMessage = 'Failed to update hold.') {
    const res = await fetch(`/api/admin/booking/holds/${hold.id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const { holds: next } = await res.json();
      replaceDateHolds(hold.date, next);
      if (patch.status === 'confirmed') {
        setProspects((prev) =>
          prev.map((p) => (p.id === hold.prospect_id ? { ...p, status: 'booked' as ProspectStatus } : p))
        );
      }
      return true;
    }
    setErrorMessage(failureMessage);
    resyncHolds();
    return false;
  }

  async function deleteHold(hold: DateHold) {
    const res = await fetch(`/api/admin/booking/holds/${hold.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      const { holds: next } = await res.json();
      replaceDateHolds(hold.date, next);
    } else {
      setErrorMessage('Failed to remove hold.');
      resyncHolds();
    }
  }

  // Two calls by design: reuse the full show-creation path (slug, defaults,
  // revalidation), then mark the hold confirmed. If the second call fails the
  // show still exists and the banner says how to finish up.
  async function confirmHold(hold: DateHold) {
    const prospect = prospectsById.get(hold.prospect_id);
    const title = prospect?.name?.trim() || 'TBD';
    const res = await fetch('/api/admin/shows', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ title, date: hold.date }),
    }).catch(() => null);
    if (!res?.ok) {
      setErrorMessage('Failed to create the show.');
      return;
    }
    const created = await res.json();
    const show: BookingShow = {
      id: Number(created.id),
      slug: created.slug,
      title: created.title,
      date: hold.date,
      announced: false,
    };
    setShows((prev) => [...prev, show]);
    await patchHold(
      hold,
      { status: 'confirmed', show_id: show.id },
      'Show created, but marking the hold confirmed failed — hit Confirm on the ladder again.'
    );
  }

  async function addNote(date: string, body: string) {
    const res = await fetch('/api/admin/booking/date-notes', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ date, body }),
    }).catch(() => null);
    if (res?.status === 201) {
      const row = normalizeNote(await res.json());
      setDateNotes((prev) => [...prev, row]);
    } else {
      setErrorMessage('Failed to add note.');
    }
  }

  async function deleteNote(note: DateNote) {
    setDateNotes((prev) => prev.filter((n) => n.id !== note.id));
    const res = await fetch(`/api/admin/booking/date-notes/${note.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      setDateNotes((prev) => [...prev, note]);
      setErrorMessage('Failed to delete note.');
    }
  }

  return (
    <div>
      {errorMessage && (
        <div className="mb-4 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        {(['calendar', 'list'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`rounded px-3 py-1.5 font-mono text-sm uppercase tracking-widest transition-colors ${
              view === option
                ? 'bg-[#E8E0D0] text-[#171412]'
                : 'border border-[#E8E0D0]/30 text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'calendar' ? (
            <BookingCalendar
              dayInfoByDate={dayInfoByDate}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
            />
          ) : (
            <BookingListView
              infos={agendaInfos}
              prospectsById={prospectsById}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
            />
          )}

          {selectedInfo && (
            <DayPanel
              info={selectedInfo}
              prospects={prospects}
              prospectsById={prospectsById}
              onClose={() => setSelectedDate(null)}
              onToggleAvailable={toggleAvailable}
              onAddHold={addHold}
              onPatchHold={patchHold}
              onDeleteHold={deleteHold}
              onConfirmHold={confirmHold}
              onAddNote={addNote}
              onDeleteNote={deleteNote}
            />
          )}
        </div>

        <ProspectRail
          prospects={prospects}
          holds={holds}
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
  );
}
