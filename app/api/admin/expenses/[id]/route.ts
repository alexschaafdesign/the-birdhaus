import { NextResponse } from 'next/server';
import { updateExpense, deleteExpense, buildExpenseInput, type ExpenseBody } from '@/lib/expenses';
import { requireAdmin } from '@/lib/admin-session';

// Admin-gated by proxy.ts.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as ExpenseBody;
  const input = buildExpenseInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }
  const expense = await updateExpense(id, input);
  if (!expense) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, expense });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }
  const deleted = await deleteExpense(id);
  if (!deleted) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
