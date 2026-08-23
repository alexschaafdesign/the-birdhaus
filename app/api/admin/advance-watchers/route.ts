import { NextResponse } from 'next/server';
import { getAdvanceWatchers, updateAdvanceWatchers } from '@/lib/advance-watchers';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

export async function GET() {
  const emails = await getAdvanceWatchers();
  return NextResponse.json({ emails });
}

// PUT { emails: string[] } — replace the watcher list.
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.emails)) {
    return NextResponse.json({ error: 'emails must be an array' }, { status: 400 });
  }
  const emails = await updateAdvanceWatchers(body.emails);
  return NextResponse.json({ emails });
}
