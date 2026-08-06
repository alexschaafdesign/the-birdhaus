import { NextResponse } from 'next/server';
import { listEntries, createEntry, buildEntryInput, type TimesheetEntryBody } from '@/lib/timesheet';

// Admin-gated by proxy.ts (the /api/admin/* matcher).

export async function GET() {
  const entries = await listEntries();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as TimesheetEntryBody;
  const input = buildEntryInput(body);
  if ('error' in input) {
    return NextResponse.json({ success: false, error: input.error }, { status: 400 });
  }

  const entry = await createEntry(input);
  return NextResponse.json({ success: true, entry });
}
