'use client';

import { useMemo, useState } from 'react';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import {
  STATUS_LABELS,
  STATUS_SWATCH,
  SUBMISSION_STATUSES,
  parseAvailability,
  availabilityEntryOverlaps,
  formatAvailabilityEntries,
  type AvailabilityEntry,
  type Submission,
  type SubmissionStatus,
} from '@/lib/submissions';
import type { AvailableDate } from '@/lib/available-dates';
import { FORM } from '@/components/night/form';
import { Panel, PageHeader, Swatch, ADMIN_TYPE, FIELD_INLINE, buttonClassName } from './ui';

const inputClass = FORM.field;

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
}: {
  initialSubmissions: Submission[];
  initialAvailableDates: AvailableDate[];
}) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [availableDates, setAvailableDates] = useState<AvailableDate[]>(initialAvailableDates);
  const [newAvailableDate, setNewAvailableDate] = useState('');
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
      <PageHeader overline="Shows" title="Submissions" description={`${submissions.length} band submissions`} />

      {errorMessage && (
        <div role="alert" className={`${FORM.error} mb-4 flex items-center justify-between gap-3`}>
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage(null)} className={ADMIN_TYPE.link}>
            Dismiss
          </button>
        </div>
      )}

      <div className="sticky top-0 z-10 bg-surface-paper pt-4 pb-4 border-b border-surface-ink mb-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search band, contact, genre, availability, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} w-full max-w-sm`}
          />

          <div className="flex items-center gap-2">
            <div role="group" aria-label="Date filter" className="flex gap-2">
              <button
                type="button"
                onClick={() => switchDateMode('single')}
                aria-pressed={dateMode === 'single'}
                className={buttonClassName(dateMode === 'single' ? 'primary' : 'secondary', 's')}
              >
                On date
              </button>
              <button
                type="button"
                onClick={() => switchDateMode('range')}
                aria-pressed={dateMode === 'range'}
                className={buttonClassName(dateMode === 'range' ? 'primary' : 'secondary', 's')}
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
                className={`${FIELD_INLINE} w-40`}
                title="Available on"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={`${FIELD_INLINE} w-36`}
                  title="Available from"
                />
                <span className="text-surface-ink/60 text-body-3">&ndash;</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={`${FIELD_INLINE} w-36`}
                  title="Available to"
                />
              </div>
            )}

            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={clearDateFilter}
                className={`text-data-caption-13 ${ADMIN_TYPE.link}`}
              >
                Clear
              </button>
            )}
          </div>

          {(dateFrom || dateTo) && (
            <label className="flex items-center gap-1.5 text-body-3">
              <input
                type="checkbox"
                className="accent-surface-ink size-4"
                checked={includeUndated}
                onChange={(e) => setIncludeUndated(e.target.checked)}
              />
              include un-dated
            </label>
          )}

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'newest' | 'band_name')}
            className={`${FIELD_INLINE} w-auto`}
          >
            <option value="newest">Newest first</option>
            <option value="band_name">Band name A-Z</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className={`ml-auto ${buttonClassName(showAddForm ? 'secondary' : 'primary', 's')}`}
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
                type="button"
                onClick={() => toggleStatus(status)}
                aria-pressed={active}
                className={`text-data-caption-13 inline-flex cursor-pointer items-center gap-1.5 border px-3 py-1 ${
                  active
                    ? 'border-surface-ink bg-surface-paper-shade font-bold'
                    : 'border-surface-ink/40 text-surface-ink/60 hover:text-accent-red'
                }`}
              >
                <Swatch className={STATUS_SWATCH[status].swatch} />
                {STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>

        <p className={ADMIN_TYPE.meta}>
          {filtered.length} of {submissions.length} submissions shown
        </p>
      </div>

      <Panel
        title="Venue open dates"
        action={
          availableDates.length > 0 ? (
            <span className={ADMIN_TYPE.meta}>Click a date to see who&rsquo;s free</span>
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
                className={`text-data-caption-13 flex items-center border ${
                  active ? 'border-surface-ink bg-surface-paper-shade font-bold' : 'border-surface-ink/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectAvailableDate(d.date)}
                  aria-pressed={active}
                  className="cursor-pointer py-1 pr-1.5 pl-3 hover:underline"
                >
                  {formatAvailabilityEntries([{ type: 'date', value: d.date }])}
                  {count > 0 && <span className="opacity-60"> · {count}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAvailableDate(d.id)}
                  className="cursor-pointer py-1 pr-2 pl-1 hover:text-accent-red"
                  aria-label={`Remove ${d.date}`}
                >
                  ×
                </button>
              </div>
            );
          })}
          {availableDates.length === 0 && (
            <p className={ADMIN_TYPE.meta}>No open dates added yet.</p>
          )}
          <form onSubmit={handleAddAvailableDate} className="flex items-center gap-1.5">
            <input
              type="date"
              value={newAvailableDate}
              onChange={(e) => setNewAvailableDate(e.target.value)}
              className={`${FIELD_INLINE} w-40`}
            />
            <button
              type="submit"
              className={buttonClassName('secondary', 's')}
            >
              + Add
            </button>
          </form>
        </div>
      </Panel>

      {showAddForm && <AddSubmissionForm onAdd={handleAdd} onCancel={() => setShowAddForm(false)} />}

      <div className="space-y-3">
        {filtered.map((submission) => (
          <SubmissionCard
            key={submission.id}
            submission={submission}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-surface-ink/60 text-body-3 py-8 text-center">No submissions match these filters.</p>
        )}
      </div>
    </div>
  );
}

function SubmissionCard({
  submission,
  onUpdate,
  onDelete,
}: {
  submission: Submission;
  onUpdate: (id: number, patch: Record<string, unknown>) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState(submission.notes ?? '');
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityEntry[]>(submission.availability);

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
      className={`border-surface-ink bg-surface-paper border border-l-4 p-4 ${STATUS_SWATCH[submission.status].edge}`}
    >
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-left font-bold text-header-4 cursor-pointer hover:text-accent-red"
          >
            {submission.band_name}
          </button>
          <div className="text-body-3 text-surface-ink/60 flex flex-wrap gap-x-3 mt-0.5">
            {submission.genre && <span>{submission.genre}</span>}
            {submission.contact_name && <span>{submission.contact_name}</span>}
            {submission.email && (
              <a href={`mailto:${submission.email}`} className="underline hover:text-accent-red">
                {submission.email}
              </a>
            )}
            {submission.socials && <span>{submission.socials}</span>}
          </div>
          {submission.availability_text && (
            <p className="text-body-3 text-surface-ink/80 mt-2 whitespace-pre-wrap">
              📅 {submission.availability_text}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Swatch className={STATUS_SWATCH[submission.status].swatch} />
          <select
            value={submission.status}
            onChange={(e) => onUpdate(submission.id, { status: e.target.value })}
            aria-label="Submission status"
            className={`text-data-caption-13 border-surface-ink bg-surface-paper cursor-pointer border py-1 pr-2 pl-2 ${ADMIN_TYPE.focus}`}
          >
            {SUBMISSION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>

          <span className={ADMIN_TYPE.meta}>{createdDate}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-surface-ink grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={FORM.label}>
              Availability
            </label>
            <AvailabilityPicker
              entries={availabilityDraft}
              onChange={handleAvailabilityChange}
              inputClassName={`${FIELD_INLINE} w-36`}
            />
          </div>

          {submission.comments && (
            <div className="sm:col-span-2">
              <label className={FORM.label}>
                Their comments
              </label>
              <p className="text-body-3 whitespace-pre-wrap">{submission.comments}</p>
            </div>
          )}

          <div className="sm:col-span-2">
            <label className={FORM.label}>
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

          <div className="sm:col-span-2 flex justify-between items-center text-data-caption-13 text-surface-ink/60">
            <span>source: {submission.source}</span>
            <button type="button" onClick={() => onDelete(submission.id)} className="text-accent-red cursor-pointer underline-offset-4 hover:underline">
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
      className="border border-surface-ink bg-surface-paper-shade p-4 mb-4 grid gap-3 sm:grid-cols-2"
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
        <button type="button" onClick={onCancel} className={buttonClassName('ghost', 's')}>
          Cancel
        </button>
        <button
          type="submit"
          className={buttonClassName('primary', 's')}
        >
          Add
        </button>
      </div>
    </form>
  );
}
