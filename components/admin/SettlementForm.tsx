'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ShowBandPaidStatus } from '@/lib/bands';
import { buttonClassName } from './ui';
import {
  computeSettlementSummary,
  formatCurrency,
  formatPct,
  bandShare,
  bandDue,
  DEFAULT_SETTLEMENT_VALUES,
  FEE_INCOME_FIELDS,
  NUMERIC_FIELDS,
  PAID_METHODS,
  PAYEE_EXPENSE_FIELDS,
  SHOW_INCOME_FIELDS,
  VENUE_EXPENSE_FIELDS,
  VENUE_ADDITIONAL_INCOME_FIELDS,
  type DealType,
  type NumericField,
  type PaidMethod,
  type SettlementValues,
} from '@/lib/settlements';

const inputClass =
  'bg-surface-paper text-surface-ink border border-surface-ink rounded-none px-3 py-1.5 text-body-3 placeholder:text-surface-ink/45 focus-visible:outline-accent-red focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';

// Hides the native up/down spinner on number inputs (Firefox + WebKit) — nudging
// a dollar amount by $1 at a time isn't useful here.
const numberInputClass = `${inputClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

const ACCENT = {
  neutral: 'bg-surface-ink/30',
  income: 'bg-surface-ink',
  expense: 'bg-spectrum-amber',
  band: 'bg-spectrum-violet',
} as const;

// Background/border for the whole card when `tint` is set — a wash of the accent
// color; otherwise the neutral panel style.
const TINT = {
  neutral: 'border-surface-ink bg-surface-paper',
  income: 'border-surface-ink border-2 bg-surface-paper',
  expense: 'border-surface-ink border-2 bg-surface-paper',
  band: 'border-surface-ink border-2 bg-surface-paper',
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
    <div className={`border p-4 ${tint ? TINT[accent] : TINT.neutral}`}>
      <div className={`flex items-center justify-between gap-3 ${showBody ? 'mb-3' : ''}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="flex shrink-0 items-center gap-2 text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase group-hover:text-accent-red">
              <span aria-hidden className={`size-2.5 shrink-0 ${ACCENT[accent]}`} />
              {title}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-surface-ink/60 transition-transform ${collapsed ? '' : 'rotate-180'}`}
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            {collapsed && summary != null && (
              <span className="truncate text-data-caption-13 text-surface-ink/60">{summary}</span>
            )}
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
            <span aria-hidden className={`size-2.5 shrink-0 ${ACCENT[accent]}`} />
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
    <div className="bg-surface-paper-shade p-2.5">
      <label className="block text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60 mb-1">
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
        // admin-tokens-ok: Venmo's own brand colours for its logo mark.
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
  incomeSquare: <span className="text-surface-ink/80"><Icon name="square" /></span>,
  incomeVenmo: <Icon name="venmo" />,
  incomeCash: <span className="text-surface-ink"><Icon name="cash" /></span>,
  beverageIncomeVenmo: <Icon name="venmo" />,
  beverageIncomeCash: <span className="text-surface-ink"><Icon name="cash" /></span>,
  expSquareFees: <span className="text-surface-ink/80"><Icon name="square" /></span>,
  expVenmoFees: <Icon name="venmo" />,
  expSoundEngineer: <span className="text-surface-ink/60"><Icon name="mic" /></span>,
  expPhotos: <span className="text-surface-ink/60"><Icon name="camera" /></span>,
  expDoorPerson: <span className="text-surface-ink/60"><Icon name="door" /></span>,
  expAdPrint: <span className="text-surface-ink/60"><Icon name="print" /></span>,
  expAdOnline: <span className="text-surface-ink/60"><Icon name="online" /></span>,
  expSnacks: <span className="text-surface-ink/60"><Icon name="snacks" /></span>,
  expBeer: <span className="text-surface-ink/60"><Icon name="beer" /></span>,
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
    <div className="bg-surface-paper-shade p-3">
      <div className="flex items-center gap-2">
        {icon && <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{icon}</span>}
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-body-3 text-surface-ink/80">
          <span className="truncate">{label}</span>
          {badge}
        </span>
      </div>
      <div className="relative mt-2 w-32">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-3 text-surface-ink/60">$</span>
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

const PAID_METHOD_LABEL: Record<PaidMethod, string> = { cash: 'cash', venmo: 'Venmo' };

// Paid toggle that records how the payment was made: unpaid shows one button
// per method (cash/Venmo), paid collapses to a single "✓ Paid · method" button
// that unmarks on click.
function PaidToggle({
  paid,
  method,
  onChange,
}: {
  paid: boolean;
  method: PaidMethod | null;
  onChange: (paid: boolean, method: PaidMethod | null) => void;
}) {
  if (paid) {
    return (
      <button
        type="button"
        onClick={() => onChange(false, null)}
        title="Click to mark unpaid"
        className="w-full border border-surface-ink bg-surface-ink px-2 py-1 text-data-caption-13 font-bold text-surface-paper transition-colors"
      >
        ✓ Paid{method ? ` · ${PAID_METHOD_LABEL[method]}` : ''}
      </button>
    );
  }
  return (
    <div className="flex w-full gap-1">
      {PAID_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(true, m)}
          title={`Mark as paid by ${PAID_METHOD_LABEL[m]}`}
          className="flex-1 border border-surface-ink px-1 py-1 text-data-caption-13 font-bold text-surface-ink/60 transition-colors hover:bg-surface-paper-shade"
        >
          Paid {PAID_METHOD_LABEL[m]}
        </button>
      ))}
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
      <span className="flex items-center gap-2 text-data-caption-13 font-bold uppercase tracking-wide text-surface-ink/80">
        {collapsible && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={`text-surface-ink/60 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {title}
      </span>
      {summary != null && <span className="text-data-caption-13 tabular-nums text-surface-ink/60">{summary}</span>}
    </>
  );
  return (
    <div className="overflow-hidden border border-surface-ink/20 bg-surface-paper-shade">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-paper ${
            show ? 'border-b border-surface-ink/20' : ''
          }`}
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center justify-between gap-2 border-b border-surface-ink/20 px-3 py-2.5">
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
  // The night's door headcount (RSVP check-ins + walk-ins), or null when nobody
  // was checked in. Pre-fills official attendance with the same "apply" hint.
  doorAttendance?: number | null;
  // Sound-engineer photo URLs keyed by lowercased name, so the engineer payee
  // field can show an avatar for whichever registered engineer is entered.
  soundEngineerPhotos?: Record<string, string>;
  // Full registry list, shown in the dropdown when switching the sound engineer.
  soundEngineers?: Array<{ name: string; photo: string | null; paymentMethod?: string | null }>;
  // Same, for photographers.
  photographerPhotos?: Record<string, string>;
  photographers?: Array<{ name: string; photo: string | null; paymentMethod?: string | null }>;
  // Same, for door people.
  doorPersonPhotos?: Record<string, string>;
  doorPersons?: Array<{ name: string; photo: string | null; paymentMethod?: string | null }>;
}

type FormState = {
  dealType: DealType;
  notes: string;
  // Official attendance as typed; empty = not recorded.
  attendance: string;
  photographerName: string;
  soundEngineerName: string;
  doorPersonName: string;
  soundPaid: boolean;
  photographerPaid: boolean;
  doorPaid: boolean;
  soundPaidMethod: PaidMethod | null;
  photographerPaidMethod: PaidMethod | null;
  doorPaidMethod: PaidMethod | null;
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
    attendance: values.attendance === null ? '' : String(values.attendance),
    photographerName: values.photographerName ?? '',
    soundEngineerName: values.soundEngineerName ?? '',
    doorPersonName: values.doorPersonName ?? '',
    soundPaid: values.soundPaid,
    photographerPaid: values.photographerPaid,
    doorPaid: values.doorPaid,
    soundPaidMethod: values.soundPaidMethod,
    photographerPaidMethod: values.photographerPaidMethod,
    doorPaidMethod: values.doorPaidMethod,
    extraLineItems: values.extraLineItems.map((item) => ({ ...item, amount: String(item.amount) })),
  };
}

// Parse the attendance input: empty or unparseable = not recorded (null).
function parseAttendance(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : null;
}

export default function SettlementForm({
  showId,
  bands: initialBands,
  initialValues,
  advanceTicketSalesDollars = null,
  doorAttendance = null,
  soundEngineerPhotos = {},
  soundEngineers = [],
  photographerPhotos = {},
  photographers = [],
  doorPersonPhotos = {},
  doorPersons = [],
}: SettlementFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toFormState(initialValues ?? DEFAULT_SETTLEMENT_VALUES));
  const [bands, setBands] = useState<ShowBandPaidStatus[]>(initialBands);
  // In-progress payout edits, keyed by bandId. A band is only present while its
  // input is being typed into; on blur we commit and drop it, so the input falls
  // back to the stored override (or the live even split when there's none).
  const [payoutDrafts, setPayoutDrafts] = useState<Record<number, string>>({});
  // In-progress percentage edits, keyed by bandId — same lifecycle as payoutDrafts
  // but for the "% of pool" input.
  const [pctDrafts, setPctDrafts] = useState<Record<number, string>>({});
  // In-progress note edits, keyed by bandId — documents a manual dollar adjustment.
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  // In-progress payment-handle edits, keyed by bandId — the band's Venmo etc.
  // Saved to the band itself (not show_bands), so it prefills future settlements.
  const [handleDrafts, setHandleDrafts] = useState<Record<number, string>>({});
  const [bandPayError, setBandPayError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only bands that aren't excluded share the payout split.
  const payoutBandCount = bands.filter((b) => !b.excluded).length;

  async function toggleBandPaid(bandId: number, paid: boolean, paidMethod: PaidMethod | null = null) {
    // Unmarking clears the method — it only means something for a payment that happened.
    const method = paid ? paidMethod : null;
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, paid, paidMethod: method } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid, paidMethod: method }),
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
  // Persist a band's manual dollar adjustment (a number, or null to clear it and
  // pay what it's due). Coexists with the percentage share. Clearing the override
  // also clears its note, matching the server.
  async function persistBandPayout(bandId: number, override: number | null) {
    const previous = bands;
    setBands((cur) =>
      cur.map((b) =>
        b.bandId === bandId
          ? { ...b, payoutOverride: override, payoutNote: override === null ? null : b.payoutNote }
          : b
      )
    );
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

  // Persist a band's percentage share (a number, or null to clear it and follow
  // the even split). Coexists with any manual dollar override.
  async function persistBandPct(bandId: number, pct: number | null) {
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, payoutPct: pct } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutPct: pct }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBands(previous);
      setBandPayError('Failed to update — try again.');
    }
  }

  // Persist a band's payout note (a string, or null/empty to clear it).
  async function persistBandNote(bandId: number, note: string | null) {
    const clean = note && note.trim() !== '' ? note.trim() : null;
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, payoutNote: clean } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payoutNote: clean }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setBands(previous);
      setBandPayError('Failed to update — try again.');
    }
  }

  // Persist a band's payment handle (a string, or null/empty to clear it).
  async function persistBandHandle(bandId: number, handle: string | null) {
    const clean = handle && handle.trim() !== '' ? handle.trim() : null;
    const previous = bands;
    setBands((cur) => cur.map((b) => (b.bandId === bandId ? { ...b, paymentMethod: clean } : b)));
    try {
      const res = await fetch(`/api/admin/settlements/${showId}/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: clean }),
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

  function clearPctDraft(bandId: number) {
    setPctDrafts((prev) => {
      const next = { ...prev };
      delete next[bandId];
      return next;
    });
  }

  function clearNoteDraft(bandId: number) {
    setNoteDrafts((prev) => {
      const next = { ...prev };
      delete next[bandId];
      return next;
    });
  }

  // Commit the dollar-amount draft on blur. The field defaults to what the band is
  // due (its % of the pool), so a value matching the due amount — or empty —
  // clears the override; anything else stores it as the amount actually paid, and
  // the difference is kept by the venue. An unparseable entry is discarded.
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
    // Typing the due amount back in means "no adjustment" — clear the override.
    const due = band ? Math.round(bandDue(summary, band.payoutPct) * 100) / 100 : rounded;
    if (rounded === due) {
      if (band && band.payoutOverride !== null) persistBandPayout(bandId, null);
      return;
    }
    if (band && band.payoutOverride === rounded) return;
    persistBandPayout(bandId, rounded);
  }

  // Commit the note draft on blur — stores it, or clears when emptied.
  function commitNoteDraft(bandId: number) {
    const draft = noteDrafts[bandId];
    clearNoteDraft(bandId);
    if (draft === undefined) return;
    const band = bands.find((b) => b.bandId === bandId);
    const clean = draft.trim() === '' ? null : draft.trim();
    if (band && (band.payoutNote ?? null) === clean) return;
    persistBandNote(bandId, clean);
  }

  // Commit the payment-handle draft on blur — stores it, or clears when emptied.
  function commitHandleDraft(bandId: number) {
    const draft = handleDrafts[bandId];
    setHandleDrafts((prev) => {
      const next = { ...prev };
      delete next[bandId];
      return next;
    });
    if (draft === undefined) return;
    const band = bands.find((b) => b.bandId === bandId);
    const clean = draft.trim() === '' ? null : draft.trim();
    if (band && (band.paymentMethod ?? null) === clean) return;
    persistBandHandle(bandId, clean);
  }

  // Commit the percentage draft on blur. Empty clears the share (fall back to the
  // even split); a valid non-negative number stores it; anything else is discarded.
  function commitPctDraft(bandId: number) {
    const draft = pctDrafts[bandId];
    clearPctDraft(bandId);
    if (draft === undefined) return;
    const band = bands.find((b) => b.bandId === bandId);
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (band && band.payoutPct !== null) persistBandPct(bandId, null);
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) return;
    const rounded = Math.round(num * 100) / 100;
    if (band && band.payoutPct === rounded) return;
    persistBandPct(bandId, rounded);
  }

  // Clear a band's manual dollar adjustment (and its note), paying it exactly what
  // it's due. Leaves the percentage split untouched.
  function resetBandOverride(bandId: number) {
    clearPayoutDraft(bandId);
    clearNoteDraft(bandId);
    persistBandPayout(bandId, null);
  }

  async function toggleBandExcluded(bandId: number, excluded: boolean) {
    const previous = bands;
    // Excluding a band also drops it out of the paid checklist — it isn't part
    // of the payout, so its paid status is no longer meaningful.
    setBands((cur) =>
      cur.map((b) =>
        b.bandId === bandId
          ? { ...b, excluded, paid: excluded ? false : b.paid, paidMethod: excluded ? null : b.paidMethod }
          : b
      )
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
      attendance: parseAttendance(form.attendance),
      photographerName: form.photographerName,
      soundEngineerName: form.soundEngineerName,
      doorPersonName: form.doorPersonName,
      soundPaid: form.soundPaid,
      photographerPaid: form.photographerPaid,
      doorPaid: form.doorPaid,
      soundPaidMethod: form.soundPaidMethod,
      photographerPaidMethod: form.photographerPaidMethod,
      doorPaidMethod: form.doorPaidMethod,
      extraLineItems: form.extraLineItems.map((item) => ({
        type: item.type,
        label: item.label,
        amount: Number(item.amount) || 0,
      })),
    };
    // Overrides / percentage shares for the bands that share the split, in the
    // same order the pool is divided; nulls follow the even per-band share.
    const includedBands = bands.filter((b) => !b.excluded);
    const includedOverrides = includedBands.map((b) => b.payoutOverride);
    const includedPcts = includedBands.map((b) => b.payoutPct);
    return computeSettlementSummary(values, payoutBandCount, includedOverrides, includedPcts);
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
      attendance: parseAttendance(form.attendance),
      photographerName: form.photographerName.trim() || null,
      soundEngineerName: form.soundEngineerName.trim() || null,
      doorPersonName: form.doorPersonName.trim() || null,
      soundPaid: form.soundPaid,
      photographerPaid: form.photographerPaid,
      doorPaid: form.doorPaid,
      soundPaidMethod: form.soundPaidMethod,
      photographerPaidMethod: form.photographerPaidMethod,
      doorPaidMethod: form.doorPaidMethod,
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
        <div className="border border-accent-red text-accent-red text-body-3 px-4 py-2 flex justify-between items-center">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-accent-red cursor-pointer hover:underline">
            dismiss
          </button>
        </div>
      )}

      <div className="border border-surface-ink bg-surface-paper p-4 shadow-[0_0_0_1px_rgba(232,224,208,0.03)]">
        <h2 className="text-body-3 font-bold text-surface-ink/80 mb-3">Summary</h2>
        <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-body-3">
          <div className="flex justify-between">
            <dt className="text-surface-ink">Total income</dt>
            <dd className="text-surface-ink">{formatCurrency(summary.totalIncome)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-surface-ink/60">Artist pool</dt>
            <dd>{formatCurrency(summary.artistPool)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-surface-ink/60">Per band ({payoutBandCount})</dt>
            <dd>{formatCurrency(summary.perBand)}</dd>
          </div>
          {summary.bandPayoutSavings !== 0 && (
            <div className="flex justify-between">
              <dt className="text-surface-ink/60">
                {summary.bandPayoutSavings > 0 ? 'Kept from band payouts' : 'Extra paid to bands'}
              </dt>
              <dd className={summary.bandPayoutSavings > 0 ? 'text-surface-ink' : 'text-surface-ink'}>
                {summary.bandPayoutSavings > 0 ? '+' : '−'}
                {formatCurrency(Math.abs(summary.bandPayoutSavings))}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-surface-ink">Total expenses</dt>
            <dd className="text-surface-ink">{formatCurrency(summary.totalExpenses)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-surface-ink/60">Venue split</dt>
            <dd>{formatCurrency(summary.venueSplit)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-surface-ink">Venue additional income</dt>
            <dd className="text-surface-ink">{formatCurrency(summary.venueAdditionalIncome)}</dd>
          </div>
          {summary.venueRedirect !== 0 && (
            <div className="flex justify-between">
              <dt className="text-surface-ink">Venue redirect ({formatPct(Number(form.venueRedirectPct) || 0)}%)</dt>
              <dd className="text-surface-ink">−{formatCurrency(summary.venueRedirect)}</dd>
            </div>
          )}
        </dl>
        <div
          className={`mt-3 flex justify-between items-center  px-3 py-2 font-bold ${
            summary.venueNet >= 0 ? 'bg-surface-ink text-surface-paper' : 'bg-accent-red text-surface-paper'
          }`}
        >
          <span>Venue net</span>
          <span className="text-body-1">{formatCurrency(summary.venueNet)}</span>
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
            <p className="mt-1 text-data-label-10-small normal-case tracking-normal text-surface-ink/60">
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
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-data-label-10-small text-surface-ink/60">
                      <span>Advance sales: {formatCurrency(advanceTicketSalesDollars!)}</span>
                      {advanceMatches ? (
                        <span className="text-surface-ink">✓</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIncome('incomeSquare', advanceTicketSalesDollars!.toFixed(2))}
                          className="text-surface-ink/80 underline decoration-dotted underline-offset-2 hover:text-accent-red"
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
          {/* Official attendance — a headcount, not money, but it's recorded at
              the same moment as the night's income so it lives alongside it. */}
          <div className="bg-surface-paper-shade p-3">
            <div className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-body-3 text-surface-ink/80">
                <span className="truncate">Official attendance</span>
              </span>
            </div>
            <div className="mt-2 w-32">
              <input
                type="number"
                step="1"
                min="0"
                inputMode="numeric"
                aria-label="Official attendance"
                value={form.attendance}
                onChange={(e) => set('attendance', e.target.value)}
                placeholder="—"
                className={`${numberInputClass} w-full px-3 text-right`}
              />
            </div>
            {doorAttendance != null && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-data-label-10-small text-surface-ink/60">
                <span>Door check-ins: {doorAttendance}</span>
                {parseAttendance(form.attendance) === doorAttendance ? (
                  <span className="text-surface-ink">✓</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => set('attendance', String(doorAttendance))}
                    className="text-surface-ink/80 underline decoration-dotted underline-offset-2 hover:text-accent-red"
                  >
                    apply
                  </button>
                )}
              </p>
            )}
          </div>
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
                      // Both crew payees are registry-backed — pick the right list + photos.
                      const registry =
                        payee?.nameKey === 'soundEngineerName'
                          ? { list: soundEngineers, photos: soundEngineerPhotos }
                          : payee?.nameKey === 'photographerName'
                            ? { list: photographers, photos: photographerPhotos }
                            : payee?.nameKey === 'doorPersonName'
                              ? { list: doorPersons, photos: doorPersonPhotos }
                              : null;
                      // Match the stored name to a registry entry (so the <select>
                      // highlights it with the registry's casing); keep an unmatched
                      // custom value as its own option so it's never lost.
                      const matched = registry?.list.find(
                        (r) => r.name.trim().toLowerCase() === name.trim().toLowerCase()
                      );
                      const payeePhoto = registry?.photos[name.trim().toLowerCase()];
                      return (
                        <div key={key} className="flex flex-col items-center bg-surface-paper-shade p-3 text-center">
                          {payeePhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={payeePhoto} alt="" className="h-16 w-16 shrink-0 object-cover" />
                          ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-surface-paper-shade text-surface-ink/60">
                              <Icon name={CREW_ICON[key] ?? 'sound'} className="h-7 w-7" />
                            </span>
                          )}

                          {payee && registry ? (
                            <>
                              <span className="mt-2 text-data-label-10-small uppercase tracking-wide text-surface-ink/60">
                                {roleLabel}
                              </span>
                              <select
                                value={matched ? matched.name : name}
                                onChange={(e) => set(payee.nameKey, e.target.value)}
                                className={`${inputClass} mt-1 w-full text-center`}
                              >
                                <option value="">Unassigned</option>
                                {name && !matched && (
                                  <option value={name}>{name}</option>
                                )}
                                {registry.list.map((entry) => (
                                  <option key={entry.name} value={entry.name}>
                                    {entry.name}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : (
                            <span className="mt-2 text-body-3 font-bold leading-tight">{roleLabel}</span>
                          )}

                          <div className="relative mt-3 w-full">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-body-3 text-surface-ink/60">
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

                          {/* Payment handle from the crew registry (matched by name),
                              mirroring the band cards — on hand when paying out. */}
                          {payee && name.trim() && (
                            matched?.paymentMethod ? (
                              <span className="mt-1 text-data-caption-13 text-surface-ink/60">{matched.paymentMethod}</span>
                            ) : (
                              <span className="mt-1 text-data-caption-13 text-surface-ink/60">no payout handle</span>
                            )
                          )}

                          {payee && (
                            <div className="mt-2 w-full">
                              <PaidToggle
                                paid={form[payee.paidKey]}
                                method={form[payee.methodKey]}
                                onChange={(paid, method) =>
                                  setForm((prev) => ({ ...prev, [payee.paidKey]: paid, [payee.methodKey]: method }))
                                }
                              />
                            </div>
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
                              <span className="shrink-0 px-1.5 py-0.5 text-data-label-10-small text-surface-ink">
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
          <div className="mb-3 border border-accent-red text-accent-red text-data-caption-13 px-3 py-2 flex justify-between items-center">
            <span>{bandPayError}</span>
            <button
              type="button"
              onClick={() => setBandPayError(null)}
              className="text-accent-red cursor-pointer hover:underline"
            >
              dismiss
            </button>
          </div>
        )}
        {bands.length === 0 ? (
          <p className="text-data-caption-13 text-surface-ink/60">No bands linked to this show.</p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {bands.map((band) => (
              <div
                key={band.bandId}
                className={`flex flex-col items-center  bg-surface-paper-shade p-3 text-center ${
                  band.excluded ? 'opacity-50' : ''
                }`}
              >
                {band.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={band.photo} alt="" className="h-16 w-16 shrink-0 object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-surface-paper-shade text-header-4 font-bold text-surface-ink/60">
                    {band.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className={`mt-2 text-body-3 font-bold leading-tight ${band.excluded ? 'line-through' : ''}`}>
                  {band.name}
                </span>
                {/* Editable payment handle — saved to the band itself, so it's
                    prefilled here (and on every future show) once on file. */}
                <input
                  type="text"
                  aria-label={`Payout handle for ${band.name}`}
                  title="The band's payout handle (Venmo or other) — saved on the band's profile and prefilled on every future settlement"
                  placeholder="+ payout handle…"
                  value={handleDrafts[band.bandId] ?? band.paymentMethod ?? ''}
                  onChange={(e) =>
                    setHandleDrafts((prev) => ({ ...prev, [band.bandId]: e.target.value }))
                  }
                  onBlur={() => commitHandleDraft(band.bandId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className={`${inputClass} mt-1 w-full px-2 py-0.5 text-center text-data-caption-13 ${
                    band.paymentMethod ? 'text-surface-ink/80' : 'placeholder:text-surface-ink/45'
                  }`}
                />

                <div className="mt-3 w-full space-y-2">
                  {band.excluded ? (
                    <p className="py-1 text-data-caption-13 text-surface-ink/60">Excluded from split</p>
                  ) : (
                    <>
                      {/* The star: the dollar amount to send. Defaults to what the
                          band is due (its % of the pool); edit to record a different
                          amount actually paid, and the difference is kept by the venue. */}
                      <div className="relative">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-body-3 text-surface-ink/60">
                          $
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Amount to pay ${band.name}`}
                          title={
                            band.payoutOverride !== null
                              ? 'Adjusted payout — the difference from what they were due is kept by the venue'
                              : 'Amount due from the split — edit to record a different amount actually paid'
                          }
                          value={
                            payoutDrafts[band.bandId] ??
                            bandShare(summary, band.payoutOverride, band.payoutPct).toFixed(2)
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
                          className={`${numberInputClass} w-full pl-6 pr-2 text-right text-header-4 font-bold ${
                            band.payoutOverride !== null ? 'border-accent-red' : ''
                          }`}
                        />
                      </div>

                      {/* The required driver, kept visually secondary: percentage of
                          the pool. Empty it to fall back to the even split. */}
                      <div className="flex items-center justify-center gap-1 text-data-label-10-small text-surface-ink/60">
                        <input
                          type="number"
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Percentage of pool for ${band.name}`}
                          title="Percentage of the artist pool — drives the amount due"
                          value={
                            pctDrafts[band.bandId] ??
                            (band.payoutPct !== null
                              ? String(band.payoutPct)
                              : payoutBandCount > 0
                                ? (100 / payoutBandCount).toFixed(2)
                                : '0')
                          }
                          onChange={(e) => setPctDrafts((prev) => ({ ...prev, [band.bandId]: e.target.value }))}
                          onBlur={() => commitPctDraft(band.bandId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className={`${numberInputClass} w-14  border border-surface-ink bg-transparent px-1 py-0.5 text-right ${
                            band.payoutPct !== null ? 'text-accent-red' : ''
                          }`}
                        />
                        <span>% of pool</span>
                      </div>

                      {/* When the amount to send differs from what they're due, show
                          the due amount for reference plus a note explaining why. */}
                      {band.payoutOverride !== null && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-center gap-2 text-data-label-10-small text-surface-ink/60">
                            <span>due {formatCurrency(bandDue(summary, band.payoutPct))}</span>
                            <button
                              type="button"
                              onClick={() => resetBandOverride(band.bandId)}
                              title="Reset to the amount due"
                              className="underline decoration-dotted hover:text-accent-red"
                            >
                              reset
                            </button>
                          </div>
                          <input
                            type="text"
                            aria-label={`Note for ${band.name} payout`}
                            placeholder="note (e.g. band said keep the rest)"
                            value={noteDrafts[band.bandId] ?? band.payoutNote ?? ''}
                            onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [band.bandId]: e.target.value }))}
                            onBlur={() => commitNoteDraft(band.bandId)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className={`${inputClass} w-full px-2 py-1 text-data-label-10-small`}
                          />
                        </div>
                      )}
                      <PaidToggle
                        paid={band.paid}
                        method={band.paidMethod}
                        onChange={(paid, method) => toggleBandPaid(band.bandId, paid, method)}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleBandExcluded(band.bandId, !band.excluded)}
                    className="w-full border border-surface-ink px-2 py-1 text-data-caption-13 text-surface-ink/60 hover:bg-surface-paper-shade"
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
            className="text-data-caption-13 border border-surface-ink px-2 py-1 hover:bg-surface-paper-shade"
          >
            + add extra item
          </button>
        }
      >
        <div className="space-y-2">
          {form.extraLineItems.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto] items-center bg-surface-paper-shade p-2"
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
                className="text-accent-red cursor-pointer hover:underline text-body-3 px-2"
              >
                Remove
              </button>
            </div>
          ))}
          {form.extraLineItems.length === 0 && (
            <p className="text-data-caption-13 text-surface-ink/60">No extra items added yet.</p>
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

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-ink/20">
        {saved && <span className="text-body-3 text-surface-ink">Saved ✓</span>}
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClassName('primary', 'm')} disabled:opacity-50`}
        >
          {submitting ? 'Saving...' : 'Save settlement'}
        </button>
      </div>
    </form>
  );
}
