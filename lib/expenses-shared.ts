// Pure types, the category list, and formatters for the Admin expense ledger.
// No DB import here so client components (ExpensesView) can pull these in
// without dragging in the postgres driver — same split as lib/timesheet-shared.

// Fixed set of expense categories, tuned for a small music venue / band's
// year-end tax bookkeeping. Gear is split by discipline (Audio / Filming / TVs
// / Lighting) so equipment spend can be reviewed per area. Edit this list to
// add or rename categories — it's validated in code, not by a DB constraint, so
// no migration is needed.
export const EXPENSE_CATEGORIES = [
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
  'Other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
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
