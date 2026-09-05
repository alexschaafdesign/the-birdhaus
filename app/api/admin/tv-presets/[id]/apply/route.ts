import { NextResponse } from 'next/server';
import { applyPreset } from '@/lib/tv-presets';
import { requireAdmin } from '@/lib/admin-session';

// Apply a preset into a scope (global or a show). Auth is enforced centrally in
// proxy.ts for all /api/admin/* routes. Screensaver presets always apply to the
// global pool (scope is ignored for that category, inside applyPreset).

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}
function scopeShowId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const presetId = parseId(id);
  if (presetId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const showId = scopeShowId(body?.showId);

  const ok = await applyPreset(presetId, showId);
  if (!ok) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
