'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import PayeeNameInput from './PayeeNameInput';
import {
  computeSettlementSummary,
  formatCurrency,
  DEFAULT_SETTLEMENT_VALUES,
  FEE_INCOME_FIELDS,
  NUMERIC_FIELDS,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type DealType,
  type NumericField,
  type SettlementValues,
} from '@/lib/settlements';

const inputClass =
  'bg-[#E8E0D0]/[0.04] border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30 disabled:opacity-40';

// Hides the native up/down spinner on number inputs (Firefox + WebKit) — nudging
// a dollar amount by $1 at a time isn't useful here.
const numberInputClass = `${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

const ACCENT = {
  neutral: 'bg-[#E8E0D0]/50',
  income: 'bg-emerald-400',
  expense: 'bg-amber-400',
} as const;

function SectionCard({
  title,
  accent = 'neutral',
  action,
  children,
}: {
  title: string;
  accent?: keyof typeof ACCENT;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#E8E0D0]/80">
          <span className={`h-1.5 w-1.5 rounded-full ${ACCENT[accent]}`} />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md bg-black/10 p-2.5">
      <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/40 mb-1">
        {label}
        {suffix}
      </label>
      {children}
    </div>
  );
}

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
  photographerName: string;
  soundEngineerName: string;
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
    photographerName: values.photographerName ?? '',
    soundEngineerName: values.soundEngineerName ?? '',
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

  // Auto-fills the linked processor fee (e.g. expSquareFees) from the standard
  // rate whenever a contributing income field changes. A fee can draw from more
  // than one income field (Venmo fee = show Venmo + beverage Venmo), so we sum all
  // contributors off the updated state. The fee field itself stays a plain `set`
  // input, so a manual edit afterward isn't clobbered until income changes again.
  function setIncome(key: NumericField, value: string) {
    const feeLink = FEE_INCOME_FIELDS.find((f) => f.incomeKeys.includes(key));
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (feeLink) {
        const base = feeLink.incomeKeys.reduce((sum, k) => sum + (Number(next[k]) || 0), 0);
        next[feeLink.feeKey] = (base * feeLink.rate).toFixed(2);
      }
      return next;
    });
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
      photographerName: form.photographerName,
      soundEngineerName: form.soundEngineerName,
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
      photographerName: form.photographerName.trim() || null,
      soundEngineerName: form.soundEngineerName.trim() || null,
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

      <SectionCard title="Deal terms">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Deal type">
            <select
              value={form.dealType}
              onChange={(e) => set('dealType', e.target.value as DealType)}
              className={`${inputClass} w-full`}
            >
              <option value="straight_split">Straight split</option>
              <option value="venue_guarantee_then_split">Venue guarantee, then split</option>
            </select>
          </Field>
          <Field label="Artist % of split">
            <input
              type="number"
              step="0.01"
              value={form.artistSplitPct}
              onChange={(e) => set('artistSplitPct', e.target.value)}
              className={`${numberInputClass} w-full`}
            />
          </Field>
          <Field label="Venue guarantee amount">
            <input
              type="number"
              step="0.01"
              disabled={form.dealType !== 'venue_guarantee_then_split'}
              value={form.dealThreshold}
              onChange={(e) => set('dealThreshold', e.target.value)}
              className={`${numberInputClass} w-full`}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Show Income" accent="income">
        <div className="grid gap-3 sm:grid-cols-3">
          {SHOW_INCOME_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => setIncome(key, e.target.value)}
                className={`${numberInputClass} w-full`}
              />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Venue Expenses" accent="expense">
        <div className="grid gap-3 sm:grid-cols-3">
          {VENUE_EXPENSE_FIELDS.map(({ key, label }) => {
            const payee = PAYEE_EXPENSE_FIELDS.find((p) => p.amountKey === key);
            const feeLink = FEE_INCOME_FIELDS.find((f) => f.feeKey === key);
            return (
              <Field
                key={key}
                label={label}
                suffix={
                  feeLink && (
                    <span className="ml-1.5 inline-block rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-emerald-300/70">
                      auto {(feeLink.rate * 100).toFixed(1)}%
                    </span>
                  )
                }
              >
                <input
                  type="number"
                  step="0.01"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className={`${numberInputClass} w-full`}
                />
                {payee && (
                  <PayeeNameInput
                    role={payee.nameKey}
                    placeholder="Paid to"
                    value={form[payee.nameKey]}
                    onChange={(value) => set(payee.nameKey, value)}
                    className={`${inputClass} w-full mt-1.5 border-l-2 border-l-[#E8E0D0]/20`}
                  />
                )}
              </Field>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Venue Additional Income" accent="income">
        <div className="grid gap-3 sm:grid-cols-3">
          {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="0.01"
                value={form[key]}
                onChange={(e) => setIncome(key, e.target.value)}
                className={`${numberInputClass} w-full`}
              />
            </Field>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Extra line items"
        action={
          <button
            type="button"
            onClick={addExtraItem}
            className="text-xs border border-[#E8E0D0]/30 rounded px-2 py-1 hover:bg-[#E8E0D0]/10"
          >
            + add extra item
          </button>
        }
      >
        <div className="space-y-2">
          {form.extraLineItems.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] items-center rounded-md bg-black/10 p-2"
            >
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
                className={`${numberInputClass} w-28`}
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
      </SectionCard>

      <SectionCard title="Notes">
        <textarea
          rows={4}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={`${inputClass} w-full resize-y`}
        />
      </SectionCard>

      <div className="rounded-lg border border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.06] p-4 shadow-[0_0_0_1px_rgba(232,224,208,0.03)]">
        <h2 className="text-sm font-semibold text-[#E8E0D0]/90 mb-3">Summary</h2>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-emerald-300/70">Total income</dt>
            <dd className="text-emerald-300/90">{formatCurrency(summary.totalIncome)}</dd>
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
            <dt className="text-amber-300/70">Total expenses</dt>
            <dd className="text-amber-300/90">{formatCurrency(summary.totalExpenses)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#E8E0D0]/60">Venue split</dt>
            <dd>{formatCurrency(summary.venueSplit)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-emerald-300/70">Venue additional income</dt>
            <dd className="text-emerald-300/90">{formatCurrency(summary.venueAdditionalIncome)}</dd>
          </div>
        </dl>
        <div
          className={`mt-3 flex justify-between items-center rounded-md px-3 py-2 font-semibold ${
            summary.venueNet >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300'
          }`}
        >
          <span>Venue net</span>
          <span className="text-base">{formatCurrency(summary.venueNet)}</span>
        </div>
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
