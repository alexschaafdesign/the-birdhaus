// Expense ledger — raw-SQL data layer for the Admin accounting section
// (migration 046). Same shape/conventions as lib/timesheet.ts. Money is stored
// as integer cents (amount_cents). Pure types, the category list, and
// formatters live in ./expenses-shared so client components can import them
// without pulling in the postgres driver.

import { sql } from './db';
import {
  isExpenseCategory,
  type Expense,
  type ExpenseInput,
} from './expenses-shared';

export { type Expense, type ExpenseInput };

// Columns for a joined read. `e.` alias so the shows join in listExpenses works,
// and casts (::text for the date, ::int for the bigint FK) so postgres.js hands
// back plain strings/numbers rather than a raw Date / bigint string.
const COLUMNS = sql`
  e.id, e.expense_date::text as expense_date, e.amount_cents, e.vendor,
  e.category, e.notes, e.payment_method, e.show_id::int as show_id,
  e.receipt_url, e.receipt_filename, e.created_at, e.updated_at
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Validates + normalizes a raw JSON body into an ExpenseInput, or returns an
// { error } the API layer turns into a 400.
export interface ExpenseBody {
  expenseDate?: unknown;
  amountCents?: unknown;
  amountDollars?: unknown;
  vendor?: unknown;
  category?: unknown;
  notes?: unknown;
  paymentMethod?: unknown;
  showId?: unknown;
  receiptUrl?: unknown;
  receiptFilename?: unknown;
}

export function buildExpenseInput(body: ExpenseBody): ExpenseInput | { error: string } {
  const expenseDate = typeof body.expenseDate === 'string' ? body.expenseDate : '';
  if (!ISO_DATE_RE.test(expenseDate)) return { error: 'A valid date is required.' };

  // Accept either explicit cents or a dollar amount; prefer cents.
  const amountCents =
    typeof body.amountCents === 'number' && Number.isFinite(body.amountCents)
      ? Math.round(body.amountCents)
      : typeof body.amountDollars === 'number' && Number.isFinite(body.amountDollars)
        ? Math.round(body.amountDollars * 100)
        : NaN;
  if (!Number.isFinite(amountCents)) return { error: 'A valid amount is required.' };
  if (amountCents <= 0) return { error: 'Amount must be greater than zero.' };

  if (!isExpenseCategory(body.category)) return { error: 'A valid category is required.' };
  const category = body.category;

  const showId =
    typeof body.showId === 'number' && Number.isInteger(body.showId) ? body.showId : null;

  return {
    expenseDate,
    amountCents,
    vendor: optionalText(body.vendor),
    category,
    notes: optionalText(body.notes),
    paymentMethod: optionalText(body.paymentMethod),
    showId,
    receiptUrl: optionalText(body.receiptUrl),
    receiptFilename: optionalText(body.receiptFilename),
  };
}

async function fetchOne(id: number): Promise<Expense | null> {
  const [row] = await sql<Expense[]>`
    select ${COLUMNS}, s.title as show_title
    from expenses e
    left join shows s on s.id = e.show_id
    where e.id = ${id}
  `;
  return row ?? null;
}

// All expenses, most recent first.
export async function listExpenses(): Promise<Expense[]> {
  return sql<Expense[]>`
    select ${COLUMNS}, s.title as show_title
    from expenses e
    left join shows s on s.id = e.show_id
    order by e.expense_date desc, e.id desc
  `;
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const [{ id }] = await sql<{ id: number }[]>`
    insert into expenses
      (expense_date, amount_cents, vendor, category, notes, payment_method,
       show_id, receipt_url, receipt_filename)
    values
      (${input.expenseDate}, ${input.amountCents}, ${input.vendor}, ${input.category},
       ${input.notes}, ${input.paymentMethod}, ${input.showId}, ${input.receiptUrl},
       ${input.receiptFilename})
    returning id::int as id
  `;
  const row = await fetchOne(id);
  if (!row) throw new Error('Expense vanished immediately after insert');
  return row;
}

export async function updateExpense(id: number, input: ExpenseInput): Promise<Expense | null> {
  const [updated] = await sql<{ id: number }[]>`
    update expenses set
      expense_date = ${input.expenseDate},
      amount_cents = ${input.amountCents},
      vendor = ${input.vendor},
      category = ${input.category},
      notes = ${input.notes},
      payment_method = ${input.paymentMethod},
      show_id = ${input.showId},
      receipt_url = ${input.receiptUrl},
      receipt_filename = ${input.receiptFilename},
      updated_at = now()
    where id = ${id}
    returning id::int as id
  `;
  return updated ? fetchOne(updated.id) : null;
}

export async function deleteExpense(id: number): Promise<boolean> {
  const result = await sql`delete from expenses where id = ${id}`;
  return result.count > 0;
}

// Lightweight show list for the optional "link to a show" picker in the form.
export async function listShowOptions(): Promise<{ id: number; title: string; date: string | null }[]> {
  return sql<{ id: number; title: string; date: string | null }[]>`
    select id::int as id, title, date::text as date
    from shows
    order by date desc nulls last, id desc
  `;
}
