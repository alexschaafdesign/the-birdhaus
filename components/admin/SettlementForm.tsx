'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  computeSettlementSummary,
  formatCurrency,
  DEFAULT_SETTLEMENT_VALUES,
  NUMERIC_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type DealType,
  type NumericField,
  type SettlementValues,
} from '@/lib/settlements';

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30 disabled:opacity-40';

interface FormExtraLineItem {
  type: 'income' | 'expense';
  label: string;
  amount: string;
}

interface SettlementFormProps {
  showId: number;
  bandCount: number;
  initialValues: SettlementValues | null;
}

type FormState = {
  dealType: DealType;
  notes: string;
  extraLineItems: FormExtraLineItem[];
} & Record<NumericField, string>;

function toFormState(values: SettlementValues): FormState {
  const numeric = Object.fromEntries(NUMERIC_FIELDS.map((key) => [key, String(values[key])])) as Record<
    NumericField,
    string
  >;
  return {
    ...numeric,
    dealType: values.dealType,
    notes: values.notes ?? '',
    extraLineItems: values.extraLineItems.map((item) => ({ ...item, amount: String(item.amount) })),
  };
}

export default function SettlementForm({ showId, bandCount, initialValues }: SettlementFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues ?? DEFAULT_SETTLEMENT_VALUES));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addExtraItem() {
    setForm((prev) => ({
      ...prev,
      extraLineItems: [...prev.extraLineItems, { type: 'expense', label: '', amount: '0' }],
    }));
  }

  function updateExtraItem(index: number, patch: Partial<FormExtraLineItem>) {
    setForm((prev) => ({
      ...prev,
      extraLineItems: prev.extraLineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeExtraItem(index: number) {
    setForm((prev) => ({ ...prev, extraLineItems: prev.extraLineItems.filter((_, i) => i !== index) }));
  }

  const summary = useMemo(() => {
    const numericValues = Object.fromEntries(NUMERIC_FIELDS.map((key) => [key, Number(form[key]) || 0])) as Record<
      NumericField,
      number
    >;
    const values: SettlementValues = {
      ...numericValues,
      dealType: form.dealType,
      notes: form.notes,
      extraLineItems: form.extraLineItems.map((item) => ({
        type: item.type,
        label: item.label,
        amount: Number(item.amount) || 0,
      })),
    };
    return computeSettlementSummary(values, bandCount);
  }, [form, bandCount]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      dealType: form.dealType,
      notes: form.notes,
      extraLineItems: form.extraLineItems
        .filter((item) => item.label.trim())
        .map((item) => ({ type: item.type, label: item.label.trim(), amount: Number(item.amount) || 0 })),
    };
    for (const key of NUMERIC_FIELDS) {
      payload[key] = Number(form[key]) || 0;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/settlements/${showId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Failed to save settlement');
      router.push(`/admin/shows/${showId}/settlement`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settlement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Deal terms</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Deal type</label>
            <select
              value={form.dealType}
              onChange={(e) => set('dealType', e.target.value as DealType)}
              className={`${inputClass} w-full`}
            >
              <option value="straight_split">Straight split</option>
              <option value="venue_guarantee_then_split">Venue guarantee, then split</option>
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Artist % of split
            </label>
            <input
              type="number"
              step="0.01"
              value={form.artistSplitPct}
              onChange={(e) => set('artistSplitPct', e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
              Venue guarantee amount
            </label>
            <input
              type="number"
              step="0.01"
              disabled={form.dealType !== 'venue_guarantee_then_split'}
              value={form.dealThreshold}
              onChange={(e) => set('dealThreshold', e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Show Income</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SHOW_INCOME_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Venue Expenses</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VENUE_EXPENSE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Venue Additional Income</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">{label}</label>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className={`${inputClass} w-full`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#E8E0D0]/80">Extra line items</h2>
          <button
            type="button"
            onClick={addExtraItem}
            className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
          >
            + add extra item
          </button>
        </div>
        <div className="space-y-2">
          {form.extraLineItems.map((item, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] items-center">
              <select
                value={item.type}
                onChange={(e) => updateExtraItem(index, { type: e.target.value as 'income' | 'expense' })}
                className={inputClass}
              >
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
              <input
                placeholder="Label"
                value={item.label}
                onChange={(e) => updateExtraItem(index, { label: e.target.value })}
                className={`${inputClass} w-full`}
              />
              <input
                type="number"
                step="0.01"
                value={item.amount}
                onChange={(e) => updateExtraItem(index, { amount: e.target.value })}
                className={`${inputClass} w-28`}
              />
              <button
                type="button"
                onClick={() => removeExtraItem(index)}
                className="text-red-400/70 hover:text-red-400 text-sm px-2"
              >
                Remove
              </button>
            </div>
          ))}
          {form.extraLineItems.length === 0 && (
            <p className="text-xs text-[#E8E0D0]/30">No extra items added yet.</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">Notes</label>
        <textarea
          rows={4}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={`${inputClass} w-full resize-y`}
        />
      </div>

      <div className="border border-[#E8E0D0]/15 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/80 mb-3">Summary</h2>
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Total income</dt>
            <dd>{formatCurrency(summary.totalIncome)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Artist pool</dt>
            <dd>{formatCurrency(summary.artistPool)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Per band ({bandCount || 0})</dt>
            <dd>{formatCurrency(summary.perBand)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Total expenses</dt>
            <dd>{formatCurrency(summary.totalExpenses)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Venue split</dt>
            <dd>{formatCurrency(summary.venueSplit)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Venue additional income</dt>
            <dd>{formatCurrency(summary.venueAdditionalIncome)}</dd>
          </div>
          <div className="flex justify-between sm:col-span-2 pt-2 border-t border-[#E8E0D0]/10 font-semibold">
            <dt>Venue net</dt>
            <dd>{formatCurrency(summary.venueNet)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex items-center justify-end pt-2 border-t border-[#E8E0D0]/10">
        <button
          type="submit"
          disabled={submitting}
          className="border border-[#E8E0D0] rounded px-6 py-2 text-sm hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save settlement'}
        </button>
      </div>
    </form>
  );
}
