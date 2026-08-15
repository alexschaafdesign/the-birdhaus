'use client';

import { useMemo, useRef, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  formatCents,
  formatDate,
  type Expense,
} from '@/lib/expenses-shared';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0]';
const cardClass = 'border border-[#E8E0D0]/15 rounded-lg p-4';

type ShowOption = { id: number; title: string; date: string | null };

interface FormState {
  expenseDate: string;
  amountDollars: string;
  vendor: string;
  category: string;
  paymentMethod: string;
  showId: string; // '' = none
  notes: string;
  receiptUrl: string | null;
  receiptFilename: string | null;
}

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

function blankForm(): FormState {
  return {
    expenseDate: todayLocal(),
    amountDollars: '',
    vendor: '',
    category: EXPENSE_CATEGORIES[0],
    paymentMethod: '',
    showId: '',
    notes: '',
    receiptUrl: null,
    receiptFilename: null,
  };
}

export default function ExpensesView({
  initialExpenses,
  shows,
}: {
  initialExpenses: Expense[];
  shows: ShowOption[];
}) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [form, setForm] = useState<FormState>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Years present in the data, newest first, always including the current year.
  const years = useMemo(() => {
    const set = new Set<number>(expenses.map((e) => yearOf(e.expense_date)));
    set.add(yearOf(todayLocal()));
    return [...set].sort((a, b) => b - a);
  }, [expenses]);

  const [year, setYear] = useState<number>(years[0]);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const inYear = useMemo(
    () => expenses.filter((e) => yearOf(e.expense_date) === year),
    [expenses, year]
  );

  // Cash-basis category totals for the selected year (in cents).
  const { byCategory, yearTotal } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;
    for (const e of inYear) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount_cents);
      total += e.amount_cents;
    }
    const rows = [...map.entries()]
      .map(([category, cents]) => ({ category, cents }))
      .sort((a, b) => b.cents - a.cents);
    return { byCategory: rows, yearTotal: total };
  }, [inYear]);

  const visible = useMemo(
    () => (categoryFilter === 'all' ? inYear : inYear.filter((e) => e.category === categoryFilter)),
    [inYear, categoryFilter]
  );

  function resetForm() {
    setForm(blankForm());
    setEditingId(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setError(null);
    setForm({
      expenseDate: e.expense_date,
      amountDollars: (e.amount_cents / 100).toFixed(2),
      vendor: e.vendor ?? '',
      category: e.category,
      paymentMethod: e.payment_method ?? '',
      showId: e.show_id != null ? String(e.show_id) : '',
      notes: e.notes ?? '',
      receiptUrl: e.receipt_url,
      receiptFilename: e.receipt_filename,
    });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function uploadReceipt(file: File) {
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/api/admin/expenses/receipt', { method: 'POST', body: data });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) throw new Error(body?.error || 'Upload failed');
      setForm((f) => ({ ...f, receiptUrl: body.url, receiptFilename: body.filename ?? file.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function clearReceipt() {
    setForm((f) => ({ ...f, receiptUrl: null, receiptFilename: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      expenseDate: form.expenseDate,
      amountDollars: Number(form.amountDollars || '0'),
      vendor: form.vendor,
      category: form.category,
      paymentMethod: form.paymentMethod,
      showId: form.showId ? Number(form.showId) : null,
      notes: form.notes,
      receiptUrl: form.receiptUrl,
      receiptFilename: form.receiptFilename,
    };
    try {
      const url = editingId ? `/api/admin/expenses/${editingId}` : '/api/admin/expenses';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) throw new Error(body?.error || 'Something went wrong');
      const expense = body.expense as Expense;
      setExpenses((prev) => {
        const next = editingId
          ? prev.map((e) => (e.id === expense.id ? expense : e))
          : [expense, ...prev];
        return [...next].sort(
          (a, b) => b.expense_date.localeCompare(a.expense_date) || b.id - a.id
        );
      });
      // Jump the year filter to the saved expense's year so it's visible.
      setYear(yearOf(expense.expense_date));
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setConfirmDelete(null);
    if (editingId === id) resetForm();
    await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-medium">Expenses</h2>
          <p className="mt-1 text-xs text-[#E8E0D0]/50">
            General business expenses for year-end tax totals. Separate from per-show Settlements.
            Totals are cash-basis by expense date.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[#E8E0D0]/50">
          Tax year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={inputClass}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Year-end summary: total + per-category breakdown */}
      <div className={cardClass}>
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/40">{year} total</p>
          <p className="text-2xl font-bold tabular-nums">{formatCents(yearTotal)}</p>
        </div>
        {byCategory.length > 0 && (
          <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {byCategory.map(({ category, cents }) => (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter((c) => (c === category ? 'all' : category))}
                className={`flex items-baseline justify-between gap-3 rounded px-2 py-1 text-left text-sm transition hover:bg-[#E8E0D0]/[0.04] ${
                  categoryFilter === category ? 'bg-[#E8E0D0]/[0.06]' : ''
                }`}
              >
                <span className="text-[#E8E0D0]/70">{category}</span>
                <span className="tabular-nums text-[#E8E0D0]/90">{formatCents(cents)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit form */}
      <form onSubmit={submit} className={cardClass}>
        <h3 className="mb-3 text-sm font-semibold text-[#E8E0D0]/80">
          {editingId ? 'Edit expense' : 'Add expense'}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Date
            <input
              type="date"
              required
              value={form.expenseDate}
              onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Amount ($)
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amountDollars}
              onChange={(e) => setForm({ ...form, amountDollars: e.target.value })}
              className={inputClass}
              placeholder="0.00"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className={inputClass}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Vendor
            <input
              type="text"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              className={inputClass}
              placeholder="Where it was bought"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Payment method
            <input
              type="text"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
              className={inputClass}
              placeholder="Card, cash, Venmo…"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50">
            Show (optional)
            <select
              value={form.showId}
              onChange={(e) => setForm({ ...form, showId: e.target.value })}
              className={inputClass}
            >
              <option value="">— none —</option>
              {shows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.date ? `${s.date} · ` : ''}
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50 sm:col-span-2 lg:col-span-2">
            Notes (optional)
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputClass}
            />
          </label>
          <div className="flex flex-col gap-1 text-xs text-[#E8E0D0]/50 sm:col-span-2 lg:col-span-4">
            Receipt (optional — image or PDF)
            {form.receiptUrl ? (
              <div className="flex items-center gap-3">
                <a
                  href={form.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#E8E0D0] underline"
                >
                  {form.receiptFilename ?? 'View receipt'}
                </a>
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="text-xs text-[#E8E0D0]/40 hover:text-[#F5A3A3]"
                >
                  Remove
                </button>
              </div>
            ) : (
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadReceipt(file);
                }}
                className="text-sm text-[#E8E0D0]/70 file:mr-3 file:rounded file:border file:border-[#E8E0D0]/30 file:bg-transparent file:px-3 file:py-1 file:text-xs file:text-[#E8E0D0] hover:file:bg-[#E8E0D0]/[0.04]"
              />
            )}
            {uploading && <span className="text-[#E8E0D0]/50">Uploading…</span>}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <button
            type="submit"
            disabled={busy || uploading}
            className="rounded-md bg-[#E8E0D0] px-3.5 py-1.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : editingId ? 'Save changes' : '+ Add expense'}
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
          {error && <span className="text-xs text-[#F5A3A3]">{error}</span>}
        </div>
      </form>

      {/* Ledger */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#E8E0D0]/80">
          {categoryFilter === 'all' ? 'All expenses' : categoryFilter} · {year}
        </h3>
        {categoryFilter !== 'all' && (
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
          >
            Clear filter ✕
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-[#E8E0D0]/50">No expenses logged for this filter.</p>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E0D0]/10 text-left text-xs uppercase tracking-wide text-[#E8E0D0]/40">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Vendor</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Show</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3 text-center">Receipt</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-b border-[#E8E0D0]/5">
                  <td className="whitespace-nowrap py-2 pr-3">{formatDate(e.expense_date)}</td>
                  <td className="py-2 pr-3">
                    {e.vendor || <span className="text-[#E8E0D0]/30">—</span>}
                    {e.notes && <span className="block text-xs text-[#E8E0D0]/40">{e.notes}</span>}
                  </td>
                  <td className="py-2 pr-3 text-[#E8E0D0]/70">{e.category}</td>
                  <td className="py-2 pr-3 text-[#E8E0D0]/70">
                    {e.show_title || <span className="text-[#E8E0D0]/30">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {formatCents(e.amount_cents)}
                  </td>
                  <td className="py-2 pr-3 text-center">
                    {e.receipt_url ? (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#E8E0D0]/70 underline hover:text-[#E8E0D0]"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-[#E8E0D0]/25">—</span>
                    )}
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
