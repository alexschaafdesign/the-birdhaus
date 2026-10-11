'use client';

import { useMemo, useState } from 'react';
import type { AvailableDate } from '@/lib/available-dates';
import type { DateOfferStatus } from '@/lib/date-offers';
import type { BookingProspect, DateHold, DateNote } from '@/lib/booking';
import { HOLD_STATUS_RANK } from '@/lib/booking';
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
  // Bands asked about this night, booked → hold → asked → passed.
  asks: DateHold[];
  notes: DateNote[];
  offers: BookingDateOffer[];
}

// Timestamps arrive as Date objects from the server page (postgres.js parses
// timestamptz; RSC passes Dates through) but as ISO strings from the JSON API
// routes. Normalize to ISO strings so the rail's localeCompare sort works on both.
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

function normalizeHold(h: DateHold): DateHold {
  return {
    ...h,
    id: Number(h.id),
    prospect_id: Number(h.prospect_id),
    position: Number(h.position),
    show_id: h.show_id == null ? null : Number(h.show_id),
    created_at: toIso(h.created_at),
    updated_at: toIso(h.updated_at),
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
        info = { date, asks: [], notes: [], offers: [] };
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
    for (const h of holds) get(h.date).asks.push(h);
    for (const n of dateNotes) get(n.date).notes.push(n);
    for (const o of offers) get(o.date).offers.push(o);
    for (const info of map.values()) {
      info.asks.sort((a, b) => HOLD_STATUS_RANK[a.status] - HOLD_STATUS_RANK[b.status] || a.id - b.id);
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
        asks: [],
        notes: [],
        offers: [],
      }
    : null;

  // Replace one date's asked list wholesale with what the server returned.
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

  function upsertProspect(raw: BookingProspect) {
    const row = normalizeProspect(raw);
    setProspects((prev) =>
      prev.some((p) => p.id === row.id) ? prev.map((p) => (p.id === row.id ? row : p)) : [row, ...prev]
    );
  }

  // Either an existing prospect, or a typed band name (the server reuses a
  // matching prospect or creates one).
  async function addAsk(
    date: string,
    band: { prospectId: number } | { name: string; bandId: number | null }
  ) {
    const res = await fetch('/api/admin/booking/holds', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        'prospectId' in band
          ? { date, prospect_id: band.prospectId }
          : { date, name: band.name, band_id: band.bandId }
      ),
    }).catch(() => null);
    if (res?.status === 201) {
      const { hold, prospect } = await res.json();
      setHolds((prev) => [...prev, normalizeHold(hold)]);
      upsertProspect(prospect);
    } else if (res?.status === 409) {
      setErrorMessage('That band is already on this date.');
    } else {
      setErrorMessage('Failed to add the band to this date.');
    }
  }

  async function patchHold(hold: DateHold, patch: Record<string, unknown>, failureMessage = 'Failed to update.') {
    const res = await fetch(`/api/admin/booking/holds/${hold.id}`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    }).catch(() => null);
    if (res?.ok) {
      const { holds: next } = await res.json();
      replaceDateHolds(hold.date, next);
      return true;
    }
    setErrorMessage(res?.status === 409 ? 'That band already has a live ask on this date.' : failureMessage);
    resyncHolds();
    return false;
  }

  async function deleteHold(hold: DateHold) {
    const res = await fetch(`/api/admin/booking/holds/${hold.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      const { holds: next } = await res.json();
      replaceDateHolds(hold.date, next);
    } else {
      setErrorMessage('Failed to remove the band from this date.');
      resyncHolds();
    }
  }

  // Two calls by design: reuse the full show-creation path (slug, defaults,
  // revalidation), then link the show to the booked ask. If the second call
  // fails the show still exists and the banner says so.
  async function createDraftShow(hold: DateHold) {
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
      { status: 'booked', show_id: show.id },
      'Draft show created, but linking it to the booking failed — it’s on the Shows page.'
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

      <div className="mb-6 flex flex-wrap items-center gap-2">
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
        {view === 'calendar' && (
          <button
            onClick={() => setPaintAvailability((prev) => !prev)}
            className={`ml-2 rounded px-3 py-1.5 font-mono text-sm uppercase tracking-widest transition-colors ${
              paintAvailability
                ? 'border border-green-500/60 bg-green-500/15 text-green-400'
                : 'border border-[#E8E0D0]/30 text-[#E8E0D0]/60 hover:text-[#E8E0D0]'
            }`}
          >
            ✎ mark available
          </button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {view === 'calendar' ? (
            <BookingCalendar
              dayInfoByDate={dayInfoByDate}
              prospectsById={prospectsById}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate((prev) => (prev === date ? null : date))}
              paintMode={paintAvailability}
              onPaintDay={toggleAvailable}
            />
          ) : (
            <BookingListView
              infos={agendaInfos}
              prospectsById={prospectsById}
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
              info={selectedInfo}
              prospects={prospects}
              prospectsById={prospectsById}
              onClose={() => setSelectedDate(null)}
              onToggleAvailable={toggleAvailable}
              onAddAsk={addAsk}
              onPatchHold={patchHold}
              onDeleteHold={deleteHold}
              onCreateDraftShow={createDraftShow}
              onAddNote={addNote}
              onDeleteNote={deleteNote}
            />
          )}
          <ProspectRail
            prospects={prospects}
            holds={holds}
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
