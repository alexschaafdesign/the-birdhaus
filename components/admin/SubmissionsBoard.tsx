'use client';

import { useMemo, useState } from 'react';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  SUBMISSION_STATUSES,
  parseAvailability,
  availabilityEntryOverlaps,
  formatAvailabilityEntries,
  type AvailabilityEntry,
  type Submission,
  type SubmissionStatus,
} from '@/lib/submissions';
import type { AvailableDate } from '@/lib/available-dates';
import {
  DATE_OFFER_STATUSES,
  DATE_OFFER_LABELS,
  DATE_OFFER_COLORS,
  type DateOffer,
  type DateOfferStatus,
} from '@/lib/date-offers';
import Section from './Section';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

async function patchSubmission(id: number, patch: Record<string, unknown>) {
  const res = await fetch(`/api/admin/submissions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export default function SubmissionsBoard({
  initialSubmissions,
  initialAvailableDates,
  initialDateOffers,
}: {
  initialSubmissions: Submission[];
  initialAvailableDates: AvailableDate[];
  initialDateOffers: DateOffer[];
}) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>(initialAvailableDates);
  const [newAvailableDate, setNewAvailableDate] = useState('');
  const [dateOffers, setDateOffers] = useState<DateOffer[]>(initialDateOffers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<SubmissionStatus>>(
    new Set(SUBMISSION_STATUSES)
  );
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeUndated, setIncludeUndated] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'band_name'>('newest');
  const [showAddForm, setShowAddForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const availableDateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of availableDates) {
      const count = submissions.filter((s) =>
        s.availability.some((entry) => availabilityEntryOverlaps(entry, d.date, d.date))
      ).length;
      counts.set(d.date, count);
    }
    return counts;
  }, [availableDates, submissions]);

  const offersBySubmission = useMemo(() => {
    const map = new Map<number, DateOffer[]>();
    for (const offer of dateOffers) {
      const list = map.get(offer.submission_id);
      if (list) list.push(offer);
      else map.set(offer.submission_id, [offer]);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.localeCompare(b.date));
    return map;
  }, [dateOffers]);

  // When a single specific date is selected (not a range), submission cards get a
  // quick "log contact for this date" affordance for that exact date.
  const activeFilterDate = dateMode === 'single' && dateFrom && dateFrom === dateTo ? dateFrom : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filterFrom = dateFrom || '0000-01-01';
    const filterTo = dateTo || '9999-12-31';
    const dateFilterActive = Boolean(dateFrom || dateTo);

    let rows = submissions.filter((s) => {
      if (!statusFilter.has(s.status)) return false;

      if (q) {
        const haystack = [
          s.band_name,
          s.contact_name,
          s.email,
          s.socials,
          s.genre,
          s.availability_text,
          s.comments,
          s.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (dateFilterActive) {
        if (s.availability.length === 0) return includeUndated;
        return s.availability.some((entry) => availabilityEntryOverlaps(entry, filterFrom, filterTo));
      }

      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortBy === 'band_name') return a.band_name.localeCompare(b.band_name);
      // created_at is a Date object fresh from the server component's query, but a
      // string once it's round-tripped through the JSON API after an edit — normalize both.
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return rows;
  }, [submissions, search, statusFilter, dateFrom, dateTo, includeUndated, sortBy]);

  function switchDateMode(mode: 'single' | 'range') {
    setDateMode(mode);
    if (mode === 'single') {
      setDateTo(dateFrom);
    }
  }

  function clearDateFilter() {
    setDateFrom('');
    setDateTo('');
  }

  function selectAvailableDate(date: string) {
    setDateMode('single');
    setDateFrom(date);
    setDateTo(date);
  }

  async function handleAddAvailableDate(e: React.FormEvent) {
    e.preventDefault();
    if (!newAvailableDate) return;
    try {
      const res = await fetch('/api/admin/available-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: newAvailableDate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Failed to add date');
      setAvailableDates((prev) => [...prev, body].sort((a, b) => a.date.localeCompare(b.date)));
      setNewAvailableDate('');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to add date');
    }
  }

  async function handleRemoveAvailableDate(id: number) {
    setAvailableDates((prev) => prev.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/admin/available-dates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setErrorMessage('Failed to remove date — refresh and try again.');
    }
  }

  // Upserts a contact log entry — logging the same submission/date again just changes its status.
  async function logDateOffer(submissionId: number, date: string, status: DateOfferStatus = 'contacted') {
    try {
      const res = await fetch('/api/admin/date-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submissionId, date, status }),
      });
      if (!res.ok) throw new Error('Failed to log contact');
      const saved: DateOffer = await res.json();
      setDateOffers((prev) => [...prev.filter((o) => o.id !== saved.id), saved]);
    } catch {
      setErrorMessage('Failed to log contact — try again.');
    }
  }

  async function updateDateOfferStatus(offerId: number, status: DateOfferStatus) {
    setDateOffers((prev) => prev.map((o) => (o.id === offerId ? { ...o, status } : o)));
    try {
      const res = await fetch(`/api/admin/date-offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setErrorMessage('Failed to update contact status — refresh and try again.');
    }
  }

  async function removeDateOffer(offerId: number) {
    setDateOffers((prev) => prev.filter((o) => o.id !== offerId));
    try {
      const res = await fetch(`/api/admin/date-offers/${offerId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setErrorMessage('Failed to remove — refresh and try again.');
    }
  }

  function toggleStatus(status: SubmissionStatus) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  async function handleUpdate(id: number, patch: Record<string, unknown>) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } as Submission : s)));
    try {
      const updated = await patchSubmission(id, patch);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      setErrorMessage('Failed to save a change — try again.');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this submission? This can\'t be undone.')) return;
    setSubmissions((prev) => prev.filter((s) => s.id !== id));
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      setErrorMessage('Failed to delete — refresh and try again.');
    }
  }

  async function handleAdd(data: Record<string, string>) {
    const res = await fetch('/api/admin/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      setErrorMessage('Failed to add submission.');
      return;
    }
    const created = await res.json();
    setSubmissions((prev) => [created, ...prev]);
    setShowAddForm(false);
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

      <div className="sticky top-0 z-10 bg-[#171412] pt-4 pb-4 border-b border-[#E8E0D0]/15 mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search band, contact, genre, availability, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full max-w-sm`}
          />

          <div className="flex items-center gap-2">
            <div className="flex text-xs rounded border border-[#E8E0D0]/30 overflow-hidden">
              <button
                type="button"
                onClick={() => switchDateMode('single')}
                className="px-2.5 py-1.5 transition-colors"
                style={{
                  backgroundColor: dateMode === 'single' ? '#E8E0D0' : 'transparent',
                  color: dateMode === 'single' ? '#2A2420' : '#E8E0D080',
                }}
              >
                On date
              </button>
              <button
                type="button"
                onClick={() => switchDateMode('range')}
                className="px-2.5 py-1.5 transition-colors border-l border-[#E8E0D0]/30"
                style={{
                  backgroundColor: dateMode === 'range' ? '#E8E0D0' : 'transparent',
                  color: dateMode === 'range' ? '#2A2420' : '#E8E0D080',
                }}
              >
                Date range
              </button>
            </div>

            {dateMode === 'single' ? (
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDateTo(e.target.value);
                }}
                className={`${inputClass} w-40`}
                title="Available on"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={`${inputClass} w-36`}
                  title="Available from"
                />
                <span className="text-[#E8E0D0]/40 text-sm">&ndash;</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={`${inputClass} w-36`}
                  title="Available to"
                />
              </div>
            )}

            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={clearDateFilter}
                className="text-xs text-[#E8E0D0]/40 hover:text-[#E8E0D0]"
              >
                clear
              </button>
            )}
          </div>

          {(dateFrom || dateTo) && (
            <label className="flex items-center gap-1.5 text-sm text-[#E8E0D0]/60">
              <input
                type="checkbox"
                checked={includeUndated}
                onChange={(e) => setIncludeUndated(e.target.checked)}
              />
              include un-dated
            </label>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'band_name')}
            className={`${inputClass} w-auto`}
          >
            <option value="newest">Newest first</option>
            <option value="band_name">Band name A-Z</option>
          </select>

          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="ml-auto border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add submission'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {SUBMISSION_STATUSES.map((status) => {
            const active = statusFilter.has(status);
            return (
              <button
                key={status}
                onClick={() => toggleStatus(status)}
                className="text-xs px-3 py-1 rounded-full border transition-colors"
                style={{
                  borderColor: STATUS_COLORS[status],
                  backgroundColor: active ? `${STATUS_COLORS[status]}22` : 'transparent',
                  color: active ? STATUS_COLORS[status] : '#E8E0D080',
                }}
              >
                {STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-[#E8E0D0]/40">
          {filtered.length} of {submissions.length} submissions shown
        </p>
      </div>

      <Section
        title="Venue open dates"
        action={
          availableDates.length > 0 ? (
            <span className="text-xs text-[#E8E0D0]/40">click a date to see who&rsquo;s free</span>
          ) : undefined
        }
        className="mb-4"
      >
        <div className="flex flex-wrap gap-2 items-center">
          {availableDates.map((d) => {
            const active = dateMode === 'single' && dateFrom === d.date && dateTo === d.date;
            const count = availableDateCounts.get(d.date) ?? 0;
            return (
              <div
                key={d.id}
                className="flex items-center rounded-full border text-xs transition-colors"
                style={{
                  borderColor: active ? '#E8E0D0' : '#E8E0D050',
                  backgroundColor: active ? '#E8E0D022' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => selectAvailableDate(d.date)}
                  className="pl-3 pr-1.5 py-1 hover:underline"
                  style={{ color: active ? '#E8E0D0' : '#E8E0D0B0' }}
                >
                  {formatAvailabilityEntries([{ type: 'date', value: d.date }])}
                  {count > 0 && <span className="opacity-60"> · {count}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAvailableDate(d.id)}
                  className="pr-2 pl-1 py-1 text-[#E8E0D0]/40 hover:text-red-400"
                  aria-label={`Remove ${d.date}`}
                >
                  ×
                </button>
              </div>
            );
          })}
          {availableDates.length === 0 && (
            <p className="text-xs text-[#E8E0D0]/30">No open dates added yet.</p>
          )}
          <form onSubmit={handleAddAvailableDate} className="flex items-center gap-1.5">
            <input
              type="date"
              value={newAvailableDate}
              onChange={(e) => setNewAvailableDate(e.target.value)}
              className={`${inputClass} w-40`}
            />
            <button
              type="submit"
              className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1.5 hover:bg-[#E8E0D0]/10"
            >
              + add
            </button>
          </form>
        </div>
      </Section>

      {showAddForm && <AddSubmissionForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />}

      <div className="space-y-3">
        {filtered.map((submission) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            offers={offersBySubmission.get(submission.id) ?? []}
            activeFilterDate={activeFilterDate}
            onLogOffer={logDateOffer}
            onUpdateOfferStatus={updateDateOfferStatus}
            onRemoveOffer={removeDateOffer}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No submissions match these filters.</p>
        )}
      </div>
    </div>
  );
}

function SubmissionCard({
  submission,
  onUpdate,
  onDelete,
  offers,
  activeFilterDate,
  onLogOffer,
  onUpdateOfferStatus,
  onRemoveOffer,
}: {
  submission: Submission;
  onUpdate: (id: number, patch: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
  offers: DateOffer[];
  activeFilterDate: string | null;
  onLogOffer: (submissionId: number, date: string, status?: DateOfferStatus) => void;
  onUpdateOfferStatus: (offerId: number, status: DateOfferStatus) => void;
  onRemoveOffer: (offerId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(submission.notes ?? '');
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityEntry[]>(submission.availability);
  const [newOfferDate, setNewOfferDate] = useState('');

  const activeFilterOffer = activeFilterDate ? offers.find((o) => o.date === activeFilterDate) : undefined;
  const activeFilterStatus: DateOfferStatus | 'new' = activeFilterOffer?.status ?? 'new';
  const activeFilterColor = activeFilterStatus === 'new' ? STATUS_COLORS.new : DATE_OFFER_COLORS[activeFilterStatus];
  const shortActiveDate = activeFilterDate
    ? formatAvailabilityEntries([{ type: 'date', value: activeFilterDate }])
    : '';

  function handleActiveDateStatusChange(value: string) {
    if (!activeFilterDate) return;
    if (value === 'new') {
      if (activeFilterOffer) onRemoveOffer(activeFilterOffer.id);
      return;
    }
    if (activeFilterOffer) onUpdateOfferStatus(activeFilterOffer.id, value as DateOfferStatus);
    else onLogOffer(submission.id, activeFilterDate, value as DateOfferStatus);
  }

  function handleAvailabilityChange(next: AvailabilityEntry[]) {
    setAvailabilityDraft(next);
    const validated = parseAvailability(next);
    if (validated) {
      onUpdate(submission.id, { availability: validated });
    }
  }

  const createdDate = new Date(submission.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div
      className="border rounded-lg p-4 bg-[#E8E0D0]/[0.03]"
      style={{ borderColor: `${STATUS_COLORS[submission.status]}55` }}
    >
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-left font-semibold text-lg hover:underline"
          >
            {submission.band_name}
          </button>
          <div className="text-sm text-[#E8E0D0]/60 flex flex-wrap gap-x-3 mt-0.5">
            {submission.genre && <span>{submission.genre}</span>}
            {submission.contact_name && <span>{submission.contact_name}</span>}
            {submission.email && (
              <a href={`mailto:${submission.email}`} className="underline hover:text-[#E8E0D0]">
                {submission.email}
              </a>
            )}
            {submission.socials && <span>{submission.socials}</span>}
          </div>
          {submission.availability_text && (
            <p className="text-sm text-[#E8E0D0]/80 mt-2 whitespace-pre-wrap">
              📅 {submission.availability_text}
            </p>
          )}

          {offers.filter((o) => o.date !== activeFilterDate).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
              {offers
                .filter((o) => o.date !== activeFilterDate)
                .map((offer) => (
                  <div
                    key={offer.id}
                    className="flex items-center rounded-full border text-xs"
                    style={{
                      borderColor: `${DATE_OFFER_COLORS[offer.status]}55`,
                      backgroundColor: `${DATE_OFFER_COLORS[offer.status]}15`,
                      color: DATE_OFFER_COLORS[offer.status],
                    }}
                  >
                    <span className="pl-2.5 py-0.5">
                      {formatAvailabilityEntries([{ type: 'date', value: offer.date }])}
                    </span>
                    <select
                      value={offer.status}
                      onChange={(e) => onUpdateOfferStatus(offer.id, e.target.value as DateOfferStatus)}
                      className="bg-transparent text-xs pl-1 pr-0.5 py-0.5 focus:outline-none"
                      style={{ color: DATE_OFFER_COLORS[offer.status] }}
                    >
                      {DATE_OFFER_STATUSES.map((s) => (
                        <option key={s} value={s} className="text-[#2A2420]">
                          {DATE_OFFER_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onRemoveOffer(offer.id)}
                      className="pr-2 pl-0.5 py-0.5 opacity-50 hover:opacity-100"
                      aria-label={`Remove contact log for ${offer.date}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={submission.status}
            onChange={(e) => onUpdate(submission.id, { status: e.target.value })}
            className="text-xs rounded px-2 py-1 border bg-[#171412]"
            style={{ borderColor: STATUS_COLORS[submission.status], color: STATUS_COLORS[submission.status] }}
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          {activeFilterDate && (
            <select
              value={activeFilterStatus}
              onChange={(e) => handleActiveDateStatusChange(e.target.value)}
              className="text-xs rounded px-2 py-1 border bg-[#171412]"
              style={{ borderColor: activeFilterColor, color: activeFilterColor }}
              title={`Contact status for ${shortActiveDate}`}
            >
              <option value="new">New</option>
              {DATE_OFFER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {DATE_OFFER_LABELS[s]} for {shortActiveDate}
                </option>
              ))}
            </select>
          )}

          <span className="text-xs text-[#E8E0D0]/30">{createdDate}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[#E8E0D0]/10 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Availability
            </label>
            <AvailabilityPicker
              entries={availabilityDraft}
              onChange={handleAvailabilityChange}
              inputClassName={`${inputClass} w-36`}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Log contact for a date
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newOfferDate) return;
                onLogOffer(submission.id, newOfferDate);
                setNewOfferDate('');
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="date"
                value={newOfferDate}
                onChange={(e) => setNewOfferDate(e.target.value)}
                className={`${inputClass} w-40`}
              />
              <button
                type="submit"
                className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1.5 hover:bg-[#E8E0D0]/10"
              >
                + log
              </button>
            </form>
          </div>

          {submission.comments && (
            <div className="sm:col-span-2">
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
                Their comments
              </label>
              <p className="text-sm whitespace-pre-wrap">{submission.comments}</p>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Your notes
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== (submission.notes ?? '')) {
                  onUpdate(submission.id, { notes: notesDraft || null });
                }
              }}
              placeholder="Private notes only you see..."
              className={`${inputClass} w-full resize-none`}
            />
          </div>

          <div className="sm:col-span-2 flex justify-between items-center text-xs text-[#E8E0D0]/30">
            <span>source: {submission.source}</span>
            <button onClick={() => onDelete(submission.id)} className="text-red-400/70 hover:text-red-400">
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSubmissionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    band_name: '',
    contact_name: '',
    email: '',
    socials: '',
    genre: '',
    availability_text: '',
    comments: '',
    notes: '',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.band_name.trim()) return;
        onAdd(form);
      }}
      className="border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] rounded-lg p-4 mb-4 grid gap-3 sm:grid-cols-2"
    >
      <input
        required
        placeholder="Band / artist name*"
        value={form.band_name}
        onChange={(e) => set('band_name', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <input
        placeholder="Contact name"
        value={form.contact_name}
        onChange={(e) => set('contact_name', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <input
        placeholder="Email"
        value={form.email}
        onChange={(e) => set('email', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <input
        placeholder="Socials"
        value={form.socials}
        onChange={(e) => set('socials', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <input
        placeholder="Genre / vibe"
        value={form.genre}
        onChange={(e) => set('genre', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <input
        placeholder="Dates / availability (free text)"
        value={form.availability_text}
        onChange={(e) => set('availability_text', e.target.value)}
        className={`${inputClass} w-full`}
      />
      <textarea
        placeholder="Comments"
        value={form.comments}
        onChange={(e) => set('comments', e.target.value)}
        className={`${inputClass} w-full sm:col-span-2 resize-none`}
        rows={2}
      />
      <div className="sm:col-span-2 flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0] px-4 py-1.5">
          Cancel
        </button>
        <button
          type="submit"
          className="border border-[#E8E0D0] rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors"
        >
          Add
        </button>
      </div>
    </form>
  );
}
