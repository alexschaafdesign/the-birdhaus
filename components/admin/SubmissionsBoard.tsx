'use client';

import { useMemo, useState } from 'react';
import {
  STATUS_LABELS,
  STATUS_COLORS,
  SUBMISSION_STATUSES,
  parseAvailability,
  availabilityEntryOverlaps,
  type AvailabilityEntry,
  type Submission,
  type SubmissionStatus,
} from '@/lib/submissions';

const inputClass =
  'w-full bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

async function patchSubmission(id: number, patch: Record<string, unknown>) {
  const res = await fetch(`/api/admin/submissions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Update failed');
  return res.json();
}

export default function SubmissionsBoard({ initialSubmissions }: { initialSubmissions: Submission[] }) {
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<SubmissionStatus>>(
    new Set(SUBMISSION_STATUSES)
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeUndated, setIncludeUndated] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'band_name'>('newest');
  const [showAddForm, setShowAddForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
            className={`${inputClass} max-w-sm`}
          />

          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={`${inputClass} w-auto`}
            title="Available from"
          />
          <span className="text-[#E8E0D0]/40 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className={`${inputClass} w-auto`}
            title="Available to"
          />
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
      className="border rounded-lg p-4"
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
          <span className="text-xs text-[#E8E0D0]/30">{createdDate}</span>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-[#E8E0D0]/10 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Availability
            </label>
            <AvailabilityEditor entries={availabilityDraft} onChange={handleAvailabilityChange} />
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
              className={`${inputClass} resize-none`}
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

function AvailabilityEditor({
  entries,
  onChange,
}: {
  entries: AvailabilityEntry[];
  onChange: (entries: AvailabilityEntry[]) => void;
}) {
  function updateEntry(index: number, entry: AvailabilityEntry) {
    onChange(entries.map((e, i) => (i === index ? entry : e)));
  }
  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#E8E0D0]/40 w-10 flex-shrink-0">
            {entry.type === 'date' ? 'date' : 'range'}
          </span>
          {entry.type === 'date' ? (
            <input
              type="date"
              value={entry.value}
              onChange={(e) => updateEntry(i, { type: 'date', value: e.target.value })}
              className={`${inputClass} w-auto`}
            />
          ) : (
            <>
              <input
                type="date"
                value={entry.from}
                onChange={(e) => updateEntry(i, { ...entry, from: e.target.value })}
                className={`${inputClass} w-auto`}
              />
              <span className="text-[#E8E0D0]/40 text-sm">to</span>
              <input
                type="date"
                value={entry.to}
                onChange={(e) => updateEntry(i, { ...entry, to: e.target.value })}
                className={`${inputClass} w-auto`}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => removeEntry(i)}
            className="text-red-400/70 hover:text-red-400 text-xs"
          >
            remove
          </button>
        </div>
      ))}
      {entries.length === 0 && (
        <p className="text-xs text-[#E8E0D0]/30">No structured dates set yet.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange([...entries, { type: 'date', value: '' }])}
          className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
        >
          + date
        </button>
        <button
          type="button"
          onClick={() => onChange([...entries, { type: 'range', from: '', to: '' }])}
          className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
        >
          + range
        </button>
      </div>
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
      className="border border-[#E8E0D0]/20 rounded-lg p-4 mb-4 grid gap-3 sm:grid-cols-2"
    >
      <input
        required
        placeholder="Band / artist name*"
        value={form.band_name}
        onChange={(e) => set('band_name', e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Contact name"
        value={form.contact_name}
        onChange={(e) => set('contact_name', e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Email"
        value={form.email}
        onChange={(e) => set('email', e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Socials"
        value={form.socials}
        onChange={(e) => set('socials', e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Genre / vibe"
        value={form.genre}
        onChange={(e) => set('genre', e.target.value)}
        className={inputClass}
      />
      <input
        placeholder="Dates / availability (free text)"
        value={form.availability_text}
        onChange={(e) => set('availability_text', e.target.value)}
        className={inputClass}
      />
      <textarea
        placeholder="Comments"
        value={form.comments}
        onChange={(e) => set('comments', e.target.value)}
        className={`${inputClass} sm:col-span-2 resize-none`}
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
