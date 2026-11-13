import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import {
  getRehearsalSettings,
  getStandingHours,
  replaceStandingHours,
  validateStandingHours,
} from '@/lib/rehearsal/settings';

// Standing hours: the weekly template of block start times. PUT replaces the
// whole list.

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json({ hours: await getStandingHours() });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const { blockMinutes } = await getRehearsalSettings();
  const result = validateStandingHours(body?.hours, blockMinutes);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ hours: await replaceStandingHours(result.value) });
}
