import { NextResponse } from 'next/server';
import { listEntries, createEntry, buildEntryInput, type TimesheetEntryBody } from '@/lib/timesheet';
import { sendNewTimesheetEntryEmail } from '@/lib/timesheet-email';
import { requireAdmin } from '@/lib/admin-session';

// Admin-gated by proxy.ts (the /api/admin/* matcher).

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const entries = await listEntries();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as TimesheetEntryBody;
  const input = buildEntryInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const entry = await createEntry(input);

  // Notify the owner, but never let a mail failure fail the helper's save.
  try {
    await sendNewTimesheetEntryEmail(entry);
  } catch (err) {
    console.error('Failed to send new timesheet entry email:', err);
  }

  return NextResponse.json({ success: true, entry });
}
