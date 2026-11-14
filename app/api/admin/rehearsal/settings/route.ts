import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import {
  forAdmin,
  getRehearsalSettings,
  updateRehearsalSettings,
  validateSettingsInput,
} from '@/lib/rehearsal/settings';

// Rehearsal settings. Calendar feed URLs are secret: GET returns them masked,
// and PUT takes { keep: index } for a stored feed or { url } for a new one.

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return NextResponse.json(forAdmin(await getRehearsalSettings()));
}

export async function PUT(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const current = await getRehearsalSettings();
  const result = validateSettingsInput(body, current.icsFeedUrls);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const saved = await updateRehearsalSettings(result.value);
  return NextResponse.json(forAdmin(saved));
}
