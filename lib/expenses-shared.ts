// Pure types, the category list, and formatters for the Admin expense ledger.
// No DB import here so client components (ExpensesView) can pull these in
// without dragging in the postgres driver — same split as lib/timesheet-shared.

// Expenses are split by business division (Venue / Record Label / Other), and
// each division owns a distinct set of categories — so an expense's division is
// derived from its category (see divisionForCategory), no separate column
// needed. Tuned for a small music venue + label's year-end tax bookkeeping.
// Gear is split by discipline (Audio / Filming / TVs / Lighting) so equipment
// spend can be reviewed per area. Edit these lists to add or rename categories —
// they're validated in code, not by a DB constraint, so no migration is needed.
export const DIVISIONS = ['Venue', 'Record Label', 'Recording Studio', 'Other'] as const;
export type Division = (typeof DIVISIONS)[number];

const VENUE_CATEGORIES = [
  'Audio Gear',
  'Filming Gear',
  'TVs Gear',
  'Lighting Gear',
  'Marketing & Advertising',
  'Merch (Cost of Goods)',
  'Rent — Rehearsal/Storage',
  'Software & Subscriptions',
  'Travel',
  'Meals',
  'Supplies',
  'Professional Services',
] as const;

const LABEL_CATEGORIES = [
  'Physical Production',
  'Audio Services',
  'Promo & Marketing',
  'Distribution & Royalties',
  'Artwork & Design',
] as const;

const STUDIO_CATEGORIES = [
  'Recording Gear',
  'Instruments',
  'Software & Plugins',
  'Acoustic Treatment',
  'Studio Rent & Utilities',
  'Session Musicians',
  'Maintenance & Repairs',
  'Studio Supplies',
] as const;

const OTHER_CATEGORIES = ['Other'] as const;

// Categories grouped by division — the source of truth. Order drives display.
export const CATEGORIES_BY_DIVISION = {
  Venue: VENUE_CATEGORIES,
  'Record Label': LABEL_CATEGORIES,
  'Recording Studio': STUDIO_CATEGORIES,
  Other: OTHER_CATEGORIES,
} as const;

export type ExpenseCategory =
  | (typeof VENUE_CATEGORIES)[number]
  | (typeof LABEL_CATEGORIES)[number]
  | (typeof STUDIO_CATEGORIES)[number]
  | (typeof OTHER_CATEGORIES)[number];

// Flat list of every category, in division order.
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  ...VENUE_CATEGORIES,
  ...LABEL_CATEGORIES,
  ...STUDIO_CATEGORIES,
  ...OTHER_CATEGORIES,
];

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

// Which division a category belongs to. Unknown/legacy categories fall to Other.
export function divisionForCategory(category: string): Division {
  for (const division of DIVISIONS) {
    if ((CATEGORIES_BY_DIVISION[division] as readonly string[]).includes(category)) {
      return division;
    }
  }
  return 'Other';
}

export interface Expense {
  id: number;
  expense_date: string; // YYYY-MM-DD
  amount_cents: number;
  vendor: string | null;
  category: string;
  notes: string | null;
  payment_method: string | null;
  show_id: number | null;
  show_title: string | null; // joined from shows, read-only
  receipt_url: string | null;
  receipt_filename: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  expenseDate: string;
  amountCents: number;
  vendor: string | null;
  category: string;
  notes: string | null;
  paymentMethod: string | null;
  showId: number | null;
  receiptUrl: string | null;
  receiptFilename: string | null;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatCents(cents: number): string {
  return formatCurrency(cents / 100);
}

// "2026-08-15" -> "Aug 15, 2026"
export function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
