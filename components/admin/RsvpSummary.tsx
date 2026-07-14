'use client';

import { useState, type FormEvent } from 'react';
import type { Rsvp, RsvpSummary as RsvpSummaryData } from '@/lib/rsvps';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

function formatSubmittedAt(createdAt: string): string {
  return new Date(createdAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface EditForm {
  name: string;
  email: string;
  guests: string;
  emailListOptIn: boolean;
}

export default function RsvpSummary({ showId, rsvps: initialRsvps }: { showId: number } & RsvpSummaryData) {
  const [rsvps, setRsvps] = useState<Rsvp[]>(initialRsvps);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [guests, setGuests] = useState('1');
  const [emailListOptIn, setEmailListOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const totalCount = rsvps.length;
  const totalGuests = rsvps.reduce((sum, r) => sum + r.guests, 0);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/shows/${showId}/rsvps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          guests: Number.parseInt(guests, 10) || 1,
          emailListOptIn,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to add RSVP');
      setRsvps((prev) => [body as Rsvp, ...prev]);
      setName('');
      setEmail('');
      setGuests('1');
      setEmailListOptIn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add RSVP');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this RSVP?')) return;
    const previous = rsvps;
    setRsvps((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch {
      setRsvps(previous);
      setError('Failed to remove — try again.');
    }
  }

  function startEdit(rsvp: Rsvp) {
    setError(null);
    setEditingId(rsvp.id);
    setEditForm({
      name: rsvp.name,
      email: rsvp.email,
      guests: String(rsvp.guests),
      emailListOptIn: rsvp.email_list_opt_in,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(id: number) {
    if (!editForm) return;
    setError(null);
    if (!editForm.name.trim() || !editForm.email.trim()) {
      setError('Name and email are required');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/rsvps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          guests: Number.parseInt(editForm.guests, 10) || 1,
          emailListOptIn: editForm.emailListOptIn,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save RSVP');
      setRsvps((prev) => prev.map((r) => (r.id === id ? (body as Rsvp) : r)));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save RSVP');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80">RSVPs</h2>
        <span className="text-xs text-[#E8E0D0]/50">
          {totalCount} RSVP{totalCount === 1 ? '' : 's'} · {totalGuests} guest{totalGuests === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="mb-3 border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-3 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end mb-4 border border-[#E8E0D0]/10 rounded p-3">
        <div className="flex-1 min-w-[140px]">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} w-full`} />
        </div>
        <div className="w-20">
          <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Guests</label>
          <input
            type="number"
            min={1}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            className={`${inputClass} w-full text-center`}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/60 pb-1.5 whitespace-nowrap">
          <input type="checkbox" checked={emailListOptIn} onChange={(e) => setEmailListOptIn(e.target.checked)} />
          Email list
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
        >
          {submitting ? 'Adding...' : '+ Add RSVP'}
        </button>
      </form>

      <div className="space-y-2">
        {rsvps.map((rsvp) =>
          editingId === rsvp.id && editForm ? (
            <div
              key={rsvp.id}
              className="flex flex-wrap gap-2 items-end border border-[#E8E0D0]/30 rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="w-20">
                <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Guests</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.guests}
                  onChange={(e) => setEditForm({ ...editForm, guests: e.target.value })}
                  className={`${inputClass} w-full text-center`}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/60 pb-1.5 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={editForm.emailListOptIn}
                  onChange={(e) => setEditForm({ ...editForm, emailListOptIn: e.target.checked })}
                />
                Email list
              </label>
              <div className="flex items-center gap-3 pb-1.5">
                <button
                  type="button"
                  onClick={() => saveEdit(rsvp.id)}
                  disabled={savingEdit}
                  className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={cancelEdit} className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] text-sm">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={rsvp.id}
              className="flex items-center justify-between gap-4 border border-[#E8E0D0]/15 rounded-lg px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold truncate">{rsvp.name}</span>
                  <span className="text-sm text-[#E8E0D0]/50 truncate">{rsvp.email}</span>
                  {rsvp.email_list_opt_in && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-green-400/40 text-green-300">
                      Email list
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-sm text-[#E8E0D0]/50">
                <span>
                  {rsvp.guests} guest{rsvp.guests === 1 ? '' : 's'}
                </span>
                <span className="font-mono text-xs">{formatSubmittedAt(rsvp.created_at)}</span>
                <button type="button" onClick={() => startEdit(rsvp)} className="text-[#E8E0D0]/80 hover:text-[#E8E0D0] underline">
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(rsvp.id)} className="text-red-400/70 hover:text-red-400">
                  Remove
                </button>
              </div>
            </div>
          )
        )}
        {rsvps.length === 0 && (
          <p className="text-[#E8E0D0]/40 text-sm py-8 text-center">No RSVPs yet.</p>
        )}
      </div>
    </div>
  );
}
