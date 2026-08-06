'use client';

import { useMemo, useState } from 'react';
import type { TimesheetEntry } from '@/lib/timesheet';
import { computeHours, computePayout, DEFAULT_RATE_CENTS } from '@/lib/timesheet';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0]';
const cardClass = 'border border-[#E8E0D0]/15 rounded-lg p-4';

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "13:05:00" -> "1:05 PM"
function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

interface FormState {
  workerName: string;
  workDate: string;
  clockIn: string;
  clockOut: string;
  rateDollars: string;
  note: string;
}

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function blankForm(defaults: Partial<FormState> = {}): FormState {
  return {
    workerName: defaults.workerName ?? '',
    workDate: todayLocal(),
    clockIn: '',
    clockOut: '',
    rateDollars: String(DEFAULT_RATE_CENTS / 100),
    note: '',
    ...defaults,
  };
}

export default function TimesheetView({ initialEntries }: { initialEntries: TimesheetEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const lastWorker = initialEntries[0]?.worker_name ?? '';

  const [form, setForm] = useState<FormState>(() => blankForm({ workerName: lastWorker }));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const totals = useMemo(() => {
    let logged = 0;
    let paid = 0;
    for (const e of entries) {
      logged += e.payout;
      if (e.paid) paid += e.payout;
    }
    return { logged, paid, unpaid: logged - paid };
  }, [entries]);

  // Live preview of hours/payout for the entry being typed.
  const preview = useMemo(() => {
    if (!form.clockIn || !form.clockOut) return null;
    const hours = computeHours(form.clockIn, form.clockOut);
    const rateCents = Math.round(Number(form.rateDollars || '0') * 100);
    return { hours, payout: computePayout(hours, rateCents) };
  }, [form.clockIn, form.clockOut, form.rateDollars]);

  function resetForm() {
    setForm(blankForm({ workerName: form.workerName || lastWorker }));
    setEditingId(null);
    setError(null);
  }

  function startEdit(e: TimesheetEntry) {
    setEditingId(e.id);
    setError(null);
    setForm({
      workerName: e.worker_name,
      workDate: e.work_date,
      clockIn: e.clock_in.slice(0, 5),
      clockOut: e.clock_out.slice(0, 5),
      rateDollars: String(e.rate_cents / 100),
      note: e.note ?? '',
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      workerName: form.workerName,
      workDate: form.workDate,
      clockIn: form.clockIn,
      clockOut: form.clockOut,
      rateCents: Math.round(Number(form.rateDollars || '0') * 100),
      note: form.note,
    };
    try {
      const url = editingId ? `/api/admin/timesheet/${editingId}` : '/api/admin/timesheet';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'Something went wrong');
      const entry = body.entry as TimesheetEntry;
      setEntries((prev) => {
        const next = editingId ? prev.map((e) => (e.id === entry.id ? entry : e)) : [entry, ...prev];
        return [...next].sort(
          (a, b) => b.work_date.localeCompare(a.work_date) || b.clock_in.localeCompare(a.clock_in)
        );
      });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function togglePaid(entry: TimesheetEntry) {
    // Optimistic — flip locally, roll back on failure.
    const nextPaid = !entry.paid;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, paid: nextPaid } : e)));
    try {
      const res = await fetch(`/api/admin/timesheet/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid: nextPaid }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error();
      const updated = body.entry as TimesheetEntry;
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, paid: entry.paid } : e)));
    }
  }

  async function remove(id: number) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setConfirmDelete(null);
    if (editingId === id) resetForm();
    await fetch(`/api/admin/timesheet/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium">Timesheet</h2>
        <p className="mt-1 text-xs text-[#E8E0D0]/50">
          Hours logged by admin help. Paid amounts roll into the Settlements yearly summary as a venue
          expense.
        </p>
      </div>

      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={cardClass}>
          <p className="mb-1 text-xs uppercase tracking-wide text-[#E8E0D0]/40">Total logged</p>
          <p className="text-xl font-semibold">{formatCurrency(totals.logged)}</p>
        </div>
        <div className={cardClass}>
          <p className="mb-1 text-xs uppercase tracking-wide text-[#E8E0D0]/40">Paid</p>
          <p className="text-xl font-semibold text-[#E8E0D0]/70">{formatCurrency(totals.paid)}</p>
        </div>
        <div className="rounded-lg border-2 border-[#E8E0D0] p-4">
          <p className="mb-1 text-xs uppercase tracking-wide text-[#E8E0D0]/60">Unpaid balance</p>
          <p className="text-2xl font-bold">{formatCurrency(totals.unpaid)}</p>
        </div>
      </div>

      {/* Add / edit form */}
      <form onSubmit={submit} className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[#E8E0D0]/80">
          {editingId ? 'Edit entry' : 'Add hours'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50 lg:col-span-2">
            Who
            <input
              type="text"
              required
              value={form.workerName}
              onChange={(e) => setForm({ ...form, workerName: e.target.value })}
              className={inputClass}
              placeholder="Name"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Date
            <input
              type="date"
              required
              value={form.workDate}
              onChange={(e) => setForm({ ...form, workDate: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Clock in
            <input
              type="time"
              required
              value={form.clockIn}
              onChange={(e) => setForm({ ...form, clockIn: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Clock out
            <input
              type="time"
              required
              value={form.clockOut}
              onChange={(e) => setForm({ ...form, clockOut: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Rate ($/hr)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.rateDollars}
              onChange={(e) => setForm({ ...form, rateDollars: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50 lg:col-span-6">
            Note (optional)
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : editingId ? 'Save changes' : '+ Add entry'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
            >
              Cancel
            </button>
          )}
          {preview && (
            <span className="text-xs text-[#E8E0D0]/50">
              {preview.hours.toFixed(2)} hrs · {formatCurrency(preview.payout)}
            </span>
          )}
          {error && <span className="text-xs text-[#F5A3A3]">{error}</span>}
        </div>
      </form>

      {/* Entries table */}
      {entries.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No hours logged yet.</p>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/10 text-left text-xs uppercase tracking-wide text-[#E8E0D0]/40">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Who</th>
                <th className="py-2 pr-3">In</th>
                <th className="py-2 pr-3">Out</th>
                <th className="py-2 pr-3 text-right">Hours</th>
                <th className="py-2 pr-3 text-right">Rate</th>
                <th className="py-2 pr-3 text-right">Payout</th>
                <th className="py-2 pr-3 text-center">Paid</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className={`border-b border-[#E8E0D0]/5 ${e.paid ? 'text-[#E8E0D0]/45' : ''}`}
                >
                  <td className="whitespace-nowrap py-2 pr-3">{formatDate(e.work_date)}</td>
                  <td className="py-2 pr-3">
                    {e.worker_name}
                    {e.note && <span className="block text-xs text-[#E8E0D0]/40">{e.note}</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">{formatTime(e.clock_in)}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{formatTime(e.clock_out)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{e.hours.toFixed(2)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">${(e.rate_cents / 100).toFixed(0)}</td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">{formatCurrency(e.payout)}</td>
                  <td className="py-2 pr-3 text-center">
                    <label className="inline-flex cursor-pointer items-center gap-1">
                      <input
                        type="checkbox"
                        checked={e.paid}
                        onChange={() => togglePaid(e)}
                        className="accent-[#E8E0D0]"
                      />
                      {e.paid && e.paid_date && (
                        <span className="text-[10px] text-[#E8E0D0]/40">{formatDate(e.paid_date)}</span>
                      )}
                    </label>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      className="text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
                    >
                      Edit
                    </button>
                    {confirmDelete === e.id ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => remove(e.id)}
                          className="text-xs font-medium text-[#F5A3A3]"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(e.id)}
                        className="ml-2 text-xs text-[#E8E0D0]/40 hover:text-[#F5A3A3]"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
