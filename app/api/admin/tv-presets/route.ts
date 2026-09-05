import { NextResponse } from 'next/server';
import { listPresets, savePreset, isPresetCategory } from '@/lib/tv-presets';
import { requireAdmin } from '@/lib/admin-session';

// TV presets (072_tv_presets.sql). Auth is enforced centrally in proxy.ts for
// all /api/admin/* routes.

function scopeShowId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET ?category=screensaver|board|cards -> presets in that category.
export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const category = new URL(request.url).searchParams.get('category');
  if (!isPresetCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  return NextResponse.json(await listPresets(category));
}

// POST { category, name, showId? } — save the current content of that scope as
// a named preset (overwrites a preset of the same name in the category).
export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const category = body?.category;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!isPresetCategory(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  // Screensaver is a global pool, so its snapshots ignore scope.
  const showId = category === 'screensaver' ? null : scopeShowId(body?.showId);
  const id = await savePreset(category, name, showId);
  return NextResponse.json({ id }, { status: 201 });
}
