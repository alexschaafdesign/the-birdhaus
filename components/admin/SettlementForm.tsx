'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import PayeeNameInput from './PayeeNameInput';
import type { ShowBandPaidStatus } from '@/lib/bands';
import {
  computeSettlementSummary,
  formatCurrency,
  formatPct,
  DEFAULT_SETTLEMENT_VALUES,
  FEE_INCOME_FIELDS,
  NUMERIC_FIELDS,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type DealType,
  type NumericField,
  type PayeeNameField,
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
  band: 'bg-purple-400',
} as const;

// Background/border for the whole card when `tint` is set — a wash of the accent
// color; otherwise the neutral panel style.
const TINT = {
  neutral: 'border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03]',
  income: 'border-emerald-400/20 bg-emerald-400/[0.04]',
  expense: 'border-amber-400/20 bg-amber-400/[0.05]',
  band: 'border-purple-400/20 bg-purple-400/[0.05]',
} as const;

function SectionCard({
  title,
  accent = 'neutral',
  action,
  summary,
  tint = false,
  collapsible = false,
  defaultCollapsed = false,
  children,
}: {
  title: string;
  accent?: keyof typeof ACCENT;
  action?: ReactNode;
  // Shown next to the title while collapsed, for an at-a-glance read.
  summary?: ReactNode;
  // Wash the whole card in the accent color.
  tint?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const showBody = !collapsible || !collapsed;
  return (
    <div className={`rounded-lg border p-4 ${tint ? TINT[accent] : TINT.neutral}`}>
      <div className={`flex items-center justify-between gap-3 ${showBody ? 'mb-3' : ''}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#E8E0D0]/80 group-hover:text-[#E8E0D0]">
              <span className={`h-1.5 w-1.5 rounded-full ${ACCENT[accent]}`} />
              {title}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-[#E8E0D0]/50 transition-transform ${collapsed ? '' : 'rotate-180'}`}
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {collapsed && summary != null && (
              <span className="truncate text-xs text-[#E8E0D0]/50">{summary}</span>
            )}
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#E8E0D0]/80">
            <span className={`h-1.5 w-1.5 rounded-full ${ACCENT[accent]}`} />
            {title}
          </h2>
        )}
        {action}
      </div>
      {showBody && children}
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

// Small inline icons used to label money rows so the sheet is quick to scan.
// Square/Venmo are approximated brand marks; the rest are generic line icons
// (stroke = currentColor, colored by the wrapper in FIELD_ICON).
function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const svg = { width: 16, height: 16, viewBox: '0 0 24 24', className, 'aria-hidden': true } as const;
  const line = { ...svg, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  switch (name) {
    case 'square':
      return (
        <svg {...svg} fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        </svg>
      );
    case 'venmo':
      return (
        <svg {...svg}>
          <rect width="24" height="24" rx="5.5" fill="#008CFF" />
          <path d="M8 7.5 12 16.5 16 7.5" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'cash':
      return (
        <svg {...line}>
          <rect x="2.5" y="6" width="19" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 9.5v5M18 9.5v5" />
        </svg>
      );
    case 'cup':
      return (
        <svg {...line}>
          <path d="M6 8h12l-1.2 11.2A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.8L6 8Z" />
          <path d="M5 8h14" />
        </svg>
      );
    case 'sound':
      return (
        <svg {...line}>
          <path d="M4 9v6h4l5 4V5L8 9H4Z" />
          <path d="M16.5 8.5a5 5 0 0 1 0 7" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...line}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M9.5 5.5h5M9.5 8h5" />
          <path d="M6 11a6 6 0 0 0 12 0" />
          <path d="M12 17v3.5M9 20.5h6" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...line}>
          <path d="M8 7 9.5 4.5h5L16 7" />
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <circle cx="12" cy="13.5" r="3.5" />
        </svg>
      );
    case 'door':
      return (
        <svg {...line}>
          <path d="M6 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17" />
          <path d="M4 21h16" />
          <circle cx="13" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'print':
      return (
        <svg {...line}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h6M7 12.5h6M7 16h4M16 9h1.5M16 12.5h1.5" />
        </svg>
      );
    case 'online':
      return (
        <svg {...line}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </svg>
      );
    case 'snacks':
      return (
        <svg {...line}>
          <path d="M6.5 8h11l-1 11.2A2 2 0 0 1 14.5 21h-5a2 2 0 0 1-2-1.8L6.5 8Z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </svg>
      );
    case 'beer':
      return (
        <svg {...line}>
          <path d="M6 8h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Z" />
          <path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" />
          <path d="M8 5v2M11.5 5v2" />
        </svg>
      );
    default:
      return null;
  }
}

// Maps each money field to a colored, scannable icon. Payment methods keep a
// consistent color everywhere they appear (income + fees); category icons are neutral.
const FIELD_ICON: Partial<Record<NumericField, ReactNode>> = {
  incomeSquare: <span className="text-[#E8E0D0]/85"><Icon name="square" /></span>,
  incomeVenmo: <Icon name="venmo" />,
  incomeCash: <span className="text-emerald-400/80"><Icon name="cash" /></span>,
  beverageIncomeVenmo: <Icon name="venmo" />,
  beverageIncomeCash: <span className="text-emerald-400/80"><Icon name="cash" /></span>,
  expSquareFees: <span className="text-[#E8E0D0]/85"><Icon name="square" /></span>,
  expVenmoFees: <Icon name="venmo" />,
  expSoundEngineer: <span className="text-[#E8E0D0]/45"><Icon name="mic" /></span>,
  expPhotos: <span className="text-[#E8E0D0]/45"><Icon name="camera" /></span>,
  expDoorPerson: <span className="text-[#E8E0D0]/45"><Icon name="door" /></span>,
  expAdPrint: <span className="text-[#E8E0D0]/45"><Icon name="print" /></span>,
  expAdOnline: <span className="text-[#E8E0D0]/45"><Icon name="online" /></span>,
  expSnacks: <span className="text-[#E8E0D0]/45"><Icon name="snacks" /></span>,
  expBeer: <span className="text-[#E8E0D0]/45"><Icon name="beer" /></span>,
};

// Compact one-line money input: icon + label on the left, a narrow $-prefixed
// number field on the right. `footer` renders below (payee/paid, hints).
function MoneyField({
  icon,
  label,
  badge,
  value,
  onChange,
  disabled,
  footer,
}: {
  icon?: ReactNode;
  label: string;
  badge?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-black/10 p-3">
      <div className="flex items-center gap-2">
        {icon && <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span>}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-[#E8E0D0]/80">
          <span className="truncate">{label}</span>
          {badge}
        </span>
      </div>
      <div className="relative mt-2 w-32">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[#E8E0D0]/40">$</span>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${numberInputClass} w-full pl-6 pr-3 text-right`}
        />
      </div>
      {footer}
    </div>
  );
}

// A labeled sub-group rendered as a solid bordered panel, optionally
// collapsible. The header always shows the group's running total on the right
// so nothing is hidden when collapsed.
function SubGroup({
  title,
  summary,
  collapsible = false,
  defaultCollapsed = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const show = !collapsible || !collapsed;
  const header = (
    <>
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#E8E0D0]/70">
        {collapsible && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`text-[#E8E0D0]/50 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {title}
      </span>
      {summary != null && <span className="text-xs tabular-nums text-[#E8E0D0]/45">{summary}</span>}
    </>
  );
  return (
    <div className="overflow-hidden rounded-lg border border-[#E8E0D0]/10 bg-black/20">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-[#E8E0D0]/[0.04] ${
            show ? 'border-b border-[#E8E0D0]/10' : ''
          }`}
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 border-b border-[#E8E0D0]/10 px-3 py-2.5">
          {header}
        </div>
      )}
      {show && <div className="p-3">{children}</div>}
    </div>
  );
}

// Visual grouping of the venue expense fields. Advertising is collapsed by
// default since it's the rarest.
const EXPENSE_GROUPS: Array<{
  title: string;
  keys: NumericField[];
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}> = [
  { title: 'Crew payments', keys: ['expSoundEngineer', 'expPhotos', 'expDoorPerson'], collapsible: true },
  { title: 'Payment fees', keys: ['expSquareFees', 'expVenmoFees'], collapsible: true, defaultCollapsed: true },
  { title: 'Advertising', keys: ['expAdPrint', 'expAdOnline'], collapsible: true, defaultCollapsed: true },
  { title: 'Concessions', keys: ['expSnacks', 'expBeer'], collapsible: true },
];

// Placeholder icon (shown in the avatar circle when there's no photo) for each
// crew card, rendered larger than the inline FIELD_ICON marks.
const CREW_ICON: Partial<Record<NumericField, string>> = {
  expSoundEngineer: 'mic',
  expPhotos: 'camera',
  expDoorPerson: 'door',
};

interface FormExtraLineItem {
  type: 'income' | 'expense';
  label: string;
  amount: string;
}

interface SettlementFormProps {
  showId: number;
  bands: ShowBandPaidStatus[];
  initialValues: SettlementValues | null;
  // Live advance ticket-sales total (dollars) from Square, or null when there are
  // none. Used to pre-fill Square income and offer a one-click "apply" re-sync.
  advanceTicketSalesDollars?: number | null;
  // Sound-engineer photo URLs keyed by lowercased name, so the engineer payee
  // field can show an avatar for whichever registered engineer is entered.
  soundEngineerPhotos?: Record<string, string>;
  // Full registry list, shown as a menu when switching the sound engineer.
  soundEngineers?: Array<{ name: string; photo: string | null }>;
}

type FormState = {
  dealType: DealType;
  notes: string;
  photographerName: string;
  soundEngineerName: string;
  soundPaid: boolean;
  photographerPaid: boolean;
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
    soundPaid: values.soundPaid,
    photographerPaid: values.photographerPaid,
    extraLineItems: values.extraLineItems.map((item) => ({ ...item, amount: String(item.amount) })),
  };
}

export default function SettlementForm({
  showId,
  bands: initialBands,
  initialValues,
  advanceTicketSalesDollars = null,
  soundEngineerPhotos = {},
  soundEngineers = [],
}: SettlementFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues ?? DEFAULT_SETTLEMENT_VALUES));
  const [bands, setBands] = useState<ShowBandPaidStatus[]>(initialBands);
  // In-progress payout edits, keyed by bandId. A band is only present while its
  // input is being typed into; on blur we commit and drop it, so the input falls
  // back to the stored override (or the live even split when there's none).
  const [payoutDrafts, setPayoutDrafts] = useState<Record<number, string>>({});
  const [bandPayError, setBandPayError] = useState<string | null>(null);
  // Which crew payee's name is being edited (so its card swaps to a typeahead).
  const [editingPayee, setEditingPayee] = useState<PayeeNameField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only bands that aren't excluded share the payout split.
  const payoutBandCount = bands.filter((b) => !b.excluded).length;

  async function toggleBandPaid(bandId: number, paid: boolean) {
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, paid } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBands(previous);
      setBandPayError('Failed to update — try again.');
    }
  }

  // Persist a band's payout override (a number, or null to clear it and follow
  // the even split). Optimistic like the paid/excluded toggles: roll back on
  // failure. Excluding a band later clears any override server-side is not needed
  // — an excluded band is dropped from the split math regardless of its override.
  async function persistBandPayout(bandId: number, override: number | null) {
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, payoutOverride: override } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutOverride: override }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBands(previous);
      setBandPayError('Failed to update — try again.');
    }
  }

  function clearPayoutDraft(bandId: number) {
    setPayoutDrafts((prev) => {
      const next = { ...prev };
      delete next[bandId];
      return next;
    });
  }

  // Commit whatever's in the draft input on blur. Empty clears the override
  // (fall back to the even split); a valid number stores it rounded to cents; an
  // unparseable entry is discarded, leaving the prior value intact.
  function commitPayoutDraft(bandId: number) {
    const draft = payoutDrafts[bandId];
    clearPayoutDraft(bandId);
    if (draft === undefined) return;
    const band = bands.find((b) => b.bandId === bandId);
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (band && band.payoutOverride !== null) persistBandPayout(bandId, null);
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return;
    const rounded = Math.round(num * 100) / 100;
    if (band && band.payoutOverride === rounded) return;
    persistBandPayout(bandId, rounded);
  }

  function resetBandPayout(bandId: number) {
    clearPayoutDraft(bandId);
    persistBandPayout(bandId, null);
  }

  async function toggleBandExcluded(bandId: number, excluded: boolean) {
    const previous = bands;
    // Excluding a band also drops it out of the paid checklist — it isn't part
    // of the payout, so its paid status is no longer meaningful.
    setBands((cur) =>
      cur.map((b) => (b.bandId === bandId ? { ...b, excluded, paid: excluded ? false : b.paid } : b))
    );
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excluded }),
      });
      if (!res.ok) throw new Error();
      if (excluded) {
        // Clear the now-stale paid flag on the server too.
        await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paid: false }),
        }).catch(() => {});
      }
      // Re-render the server component so the page's copy-summary/PDF actions,
      // which divide by the included band count, reflect the new exclusion.
      router.refresh();
    } catch {
      setBands(previous);
      setBandPayError('Failed to update — try again.');
    }
  }

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
      soundPaid: form.soundPaid,
      photographerPaid: form.photographerPaid,
      extraLineItems: form.extraLineItems.map((item) => ({
        type: item.type,
        label: item.label,
        amount: Number(item.amount) || 0,
      })),
    };
    // Overrides for the bands that share the split, in the same order the pool is
    // divided; nulls follow the even per-band share.
    const includedOverrides = bands.filter((b) => !b.excluded).map((b) => b.payoutOverride);
    return computeSettlementSummary(values, payoutBandCount, includedOverrides);
  }, [form, payoutBandCount, bands]);

  // At-a-glance deal terms shown in the collapsed section header.
  const isGuarantee = form.dealType === 'venue_guarantee_then_split';
  const dealSummary = [
    isGuarantee ? 'Venue guarantee, then split' : 'Straight split',
    `${Number(form.artistSplitPct) || 0}% artists`,
    isGuarantee ? `${formatCurrency(Number(form.dealThreshold) || 0)} guarantee` : null,
    Number(form.venueRedirectPct) > 0 ? `${Number(form.venueRedirectPct)}% redirect` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Record<string, unknown> = {
      dealType: form.dealType,
      notes: form.notes,
      photographerName: form.photographerName.trim() || null,
      soundEngineerName: form.soundEngineerName.trim() || null,
      soundPaid: form.soundPaid,
      photographerPaid: form.photographerPaid,
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
      // Stay on the page (edit-in-place); refresh so the server re-renders the
      // header's Copy/PDF actions now that a record exists.
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settlement');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-300">
            dismiss
          </button>
        </div>
      )}

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
            <dt className="text-[#E8E0D0]/60">Per band ({payoutBandCount})</dt>
            <dd>{formatCurrency(summary.perBand)}</dd>
          </div>
          {summary.bandPayoutSavings !== 0 && (
            <div className="flex justify-between">
              <dt className="text-[#E8E0D0]/60">
                {summary.bandPayoutSavings > 0 ? 'Kept from band payouts' : 'Extra paid to bands'}
              </dt>
              <dd className={summary.bandPayoutSavings > 0 ? 'text-emerald-300/90' : 'text-amber-300/90'}>
                {summary.bandPayoutSavings > 0 ? '+' : '−'}
                {formatCurrency(Math.abs(summary.bandPayoutSavings))}
              </dd>
            </div>
          )}
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
          {summary.venueRedirect !== 0 && (
            <div className="flex justify-between">
              <dt className="text-amber-300/70">Venue redirect ({formatPct(Number(form.venueRedirectPct) || 0)}%)</dt>
              <dd className="text-amber-300/90">−{formatCurrency(summary.venueRedirect)}</dd>
            </div>
          )}
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

      <SectionCard title="Deal terms" collapsible defaultCollapsed summary={dealSummary}>
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
          <Field label="Venue redirect % of split">
            <input
              type="number"
              step="0.01"
              value={form.venueRedirectPct}
              onChange={(e) => set('venueRedirectPct', e.target.value)}
              className={`${numberInputClass} w-full`}
            />
            <p className="mt-1 text-[10px] normal-case tracking-normal text-[#E8E0D0]/40">
              Share of the venue split sent to an outside party (e.g. charity), deducted after expenses.
            </p>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Show Income" accent="income" tint>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {SHOW_INCOME_FIELDS.map(({ key, label }) => {
            const showAdvanceHint = key === 'incomeSquare' && advanceTicketSalesDollars != null;
            const advanceMatches =
              advanceTicketSalesDollars != null &&
              Number(form.incomeSquare) === advanceTicketSalesDollars;
            return (
              <MoneyField
                key={key}
                icon={FIELD_ICON[key]}
                label={label}
                value={form[key]}
                onChange={(v) => setIncome(key, v)}
                footer={
                  showAdvanceHint && (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#E8E0D0]/40">
                      <span>Advance sales: {formatCurrency(advanceTicketSalesDollars!)}</span>
                      {advanceMatches ? (
                        <span className="text-emerald-400/70">✓</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIncome('incomeSquare', advanceTicketSalesDollars!.toFixed(2))}
                          className="text-[#E8E0D0]/70 underline decoration-dotted underline-offset-2 hover:text-[#E8E0D0]"
                        >
                          apply
                        </button>
                      )}
                    </p>
                  )
                }
              />
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Venue Additional Income" accent="income" tint>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {VENUE_ADDITIONAL_INCOME_FIELDS.map(({ key, label }) => (
            <MoneyField
              key={key}
              icon={FIELD_ICON[key]}
              label={label}
              value={form[key]}
              onChange={(v) => setIncome(key, v)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Venue Expenses" accent="expense" tint>
        <div className="space-y-2">
          {EXPENSE_GROUPS.map((group) => {
            const groupTotal = group.keys.reduce((sum, k) => sum + (Number(form[k]) || 0), 0);
            return (
              <SubGroup
                key={group.title}
                title={group.title}
                collapsible={group.collapsible}
                defaultCollapsed={group.defaultCollapsed}
                summary={formatCurrency(groupTotal)}
              >
                {group.title === 'Crew payments' ? (
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">
                    {group.keys.map((key) => {
                      const payee = PAYEE_EXPENSE_FIELDS.find((p) => p.amountKey === key);
                      const roleLabel = payee?.label ?? VENUE_EXPENSE_FIELDS.find((f) => f.key === key)?.label ?? key;
                      const name = payee ? form[payee.nameKey] : '';
                      // Only the free-text photographer name toggles an inline editor;
                      // the sound engineer is a registry dropdown that's always live.
                      const editing = payee?.nameKey === 'photographerName' && editingPayee === 'photographerName';
                      // Avatar for the sound-engineer payee when the entered name
                      // matches a registered engineer with a photo.
                      const engineerPhoto =
                        payee?.nameKey === 'soundEngineerName'
                          ? soundEngineerPhotos[(name || '').trim().toLowerCase()]
                          : undefined;
                      // Match the stored engineer name to a registry entry (so the
                      // <select> highlights it with the registry's casing); keep an
                      // unmatched custom value as its own option so it's not lost.
                      const matchedEngineer =
                        payee?.nameKey === 'soundEngineerName'
                          ? soundEngineers.find((e) => e.name.trim().toLowerCase() === name.trim().toLowerCase())
                          : undefined;
                      return (
                        <div key={key} className="flex flex-col items-center rounded-lg bg-black/10 p-3 text-center">
                          {engineerPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={engineerPhoto} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#E8E0D0]/10 text-[#E8E0D0]/45">
                              <Icon name={CREW_ICON[key] ?? 'sound'} className="h-7 w-7" />
                            </span>
                          )}

                          {payee ? (
                            payee.nameKey === 'soundEngineerName' ? (
                              <>
                                <span className="mt-2 text-[11px] uppercase tracking-wide text-[#E8E0D0]/35">
                                  {roleLabel}
                                </span>
                                <select
                                  value={matchedEngineer ? matchedEngineer.name : name}
                                  onChange={(e) => set(payee.nameKey, e.target.value)}
                                  className={`${inputClass} mt-1 w-full text-center`}
                                >
                                  <option value="" className="text-[#2A2420]">Unassigned</option>
                                  {name && !matchedEngineer && (
                                    <option value={name} className="text-[#2A2420]">{name}</option>
                                  )}
                                  {soundEngineers.map((engineer) => (
                                    <option key={engineer.name} value={engineer.name} className="text-[#2A2420]">
                                      {engineer.name}
                                    </option>
                                  ))}
                                </select>
                              </>
                            ) : editing ? (
                              <div className="mt-2 w-full">
                                <PayeeNameInput
                                  role={payee.nameKey}
                                  placeholder="Paid to"
                                  value={name}
                                  onChange={(v) => set(payee.nameKey, v)}
                                  className={`${inputClass} w-full text-center`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditingPayee(null)}
                                  className="mt-1 text-[11px] text-[#E8E0D0]/50 underline decoration-dotted hover:text-[#E8E0D0]"
                                >
                                  done
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="mt-2 text-sm font-medium leading-tight">
                                  {name || <span className="text-[#E8E0D0]/40">Unassigned</span>}
                                </span>
                                <span className="text-[11px] uppercase tracking-wide text-[#E8E0D0]/35">
                                  {roleLabel}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingPayee(payee.nameKey)}
                                  className="mt-0.5 text-[11px] text-[#E8E0D0]/50 underline decoration-dotted hover:text-[#E8E0D0]"
                                >
                                  {name ? 'change' : 'set name'}
                                </button>
                              </>
                            )
                          ) : (
                            <span className="mt-2 text-sm font-medium leading-tight">{roleLabel}</span>
                          )}

                          <div className="relative mt-3 w-full">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[#E8E0D0]/40">
                              $
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              inputMode="decimal"
                              value={form[key]}
                              onChange={(e) => set(key, e.target.value)}
                              className={`${numberInputClass} w-full pl-6 pr-3 text-right`}
                            />
                          </div>

                          {payee && (
                            <button
                              type="button"
                              onClick={() => set(payee.paidKey, !form[payee.paidKey])}
                              className={`mt-2 w-full rounded border px-2 py-1 text-xs font-medium transition-colors ${
                                form[payee.paidKey]
                                  ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                                  : 'border-[#E8E0D0]/25 text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10'
                              }`}
                            >
                              {form[payee.paidKey] ? '✓ Paid' : 'Mark as paid'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid items-start gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                    {group.keys.map((key) => {
                      const label = VENUE_EXPENSE_FIELDS.find((f) => f.key === key)?.label ?? key;
                      const feeLink = FEE_INCOME_FIELDS.find((f) => f.feeKey === key);
                      return (
                        <MoneyField
                          key={key}
                          icon={FIELD_ICON[key]}
                          label={label}
                          badge={
                            feeLink && (
                              <span className="shrink-0 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300/70">
                                auto {(feeLink.rate * 100).toFixed(1)}%
                              </span>
                            )
                          }
                          value={form[key]}
                          onChange={(v) => set(key, v)}
                        />
                      );
                    })}
                  </div>
                )}
              </SubGroup>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Band payouts" accent="band" tint>
        {bandPayError && (
          <div className="mb-3 border border-red-400/40 bg-red-400/10 text-red-300 text-xs rounded px-3 py-2 flex justify-between items-center">
            <span>{bandPayError}</span>
            <button
              type="button"
              onClick={() => setBandPayError(null)}
              className="text-red-300/70 hover:text-red-300"
            >
              dismiss
            </button>
          </div>
        )}
        {bands.length === 0 ? (
          <p className="text-xs text-[#E8E0D0]/30">No bands linked to this show.</p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {bands.map((band) => (
              <div
                key={band.bandId}
                className={`flex flex-col items-center rounded-lg bg-black/10 p-3 text-center ${
                  band.excluded ? 'opacity-50' : ''
                }`}
              >
                {band.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={band.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#E8E0D0]/10 text-xl font-semibold text-[#E8E0D0]/50">
                    {band.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className={`mt-2 text-sm font-medium leading-tight ${band.excluded ? 'line-through' : ''}`}>
                  {band.name}
                </span>
                {band.paymentMethod ? (
                  <span className="mt-0.5 text-xs text-[#E8E0D0]/45">{band.paymentMethod}</span>
                ) : (
                  <span className="mt-0.5 text-xs text-[#E8E0D0]/25">no payment method</span>
                )}

                <div className="mt-3 w-full space-y-2">
                  {band.excluded ? (
                    <p className="py-1 text-xs text-[#E8E0D0]/40">Excluded from split</p>
                  ) : (
                    <>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[#E8E0D0]/40">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Payout for ${band.name}`}
                          title={
                            band.payoutOverride !== null
                              ? 'Custom payout — the difference from the even split is kept as venue profit'
                              : 'Even split — edit to set a custom payout'
                          }
                          value={
                            payoutDrafts[band.bandId] ??
                            (band.payoutOverride !== null
                              ? band.payoutOverride.toFixed(2)
                              : summary.perBand.toFixed(2))
                          }
                          onChange={(e) =>
                            setPayoutDrafts((prev) => ({ ...prev, [band.bandId]: e.target.value }))
                          }
                          onBlur={() => commitPayoutDraft(band.bandId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className={`${numberInputClass} w-full pl-5 pr-2 text-right ${
                            band.payoutOverride !== null ? 'border-amber-400/60' : ''
                          }`}
                        />
                      </div>
                      {band.payoutOverride !== null && (
                        <button
                          type="button"
                          onClick={() => resetBandPayout(band.bandId)}
                          title="Reset to even split"
                          className="text-[10px] text-[#E8E0D0]/50 underline decoration-dotted hover:text-[#E8E0D0]"
                        >
                          reset to even split
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleBandPaid(band.bandId, !band.paid)}
                        className={`w-full rounded border px-2 py-1 text-xs font-medium transition-colors ${
                          band.paid
                            ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-300'
                            : 'border-[#E8E0D0]/25 text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10'
                        }`}
                      >
                        {band.paid ? '✓ Paid' : 'Mark as paid'}
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleBandExcluded(band.bandId, !band.excluded)}
                    className="w-full rounded border border-[#E8E0D0]/25 px-2 py-1 text-xs text-[#E8E0D0]/60 hover:bg-[#E8E0D0]/10"
                  >
                    {band.excluded ? 'Include in split' : 'Exclude from split'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8E0D0]/10">
        {saved && <span className="text-sm text-emerald-300">Saved ✓</span>}
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
