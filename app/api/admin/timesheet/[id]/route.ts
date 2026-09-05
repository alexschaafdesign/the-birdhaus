import { NextResponse } from 'next/server';
import {
  updateEntry,
  setPaid,
  deleteEntry,
  buildEntryInput,
  type TimesheetEntryBody,
} from '@/lib/timesheet';
import { requireAdmin } from '@/lib/admin-session';

// Admin-gated by proxy.ts. PATCH does double duty: a body carrying `paid`
// toggles the paid flag (and stamps/clears paid_date); any other body is a full
// edit of the entry's fields.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as TimesheetEntryBody & {
    paid?: unknown;
    paidDate?: unknown;
  };

  if (typeof body.paid === 'boolean') {
    const paidDate = typeof body.paidDate === 'string' ? body.paidDate : undefined;
    const entry = await setPaid(id, body.paid, paidDate);
    if (!entry) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, entry });
  }

  const input = buildEntryInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }
  const entry = await updateEntry(id, input);
  if (!entry) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, entry });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
  }
  const deleted = await deleteEntry(id);
  if (!deleted) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
