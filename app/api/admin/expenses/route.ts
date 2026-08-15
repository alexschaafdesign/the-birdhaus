import { NextResponse } from 'next/server';
import { listExpenses, createExpense, buildExpenseInput, type ExpenseBody } from '@/lib/expenses';

// Admin-gated by proxy.ts (the /api/admin/* matcher).

export async function GET() {
  const expenses = await listExpenses();
  return NextResponse.json({ expenses });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ExpenseBody;
  const input = buildExpenseInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }
  const expense = await createExpense(input);
  return NextResponse.json({ success: true, expense });
}
