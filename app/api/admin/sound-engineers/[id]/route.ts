import { NextResponse } from 'next/server';
import { updateSoundEngineerEmail } from '@/lib/sound-engineers';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.

// Update a sound engineer's contact email (used by the Advance tab to loop the
// confirmed engineer onto the advance). Email persists on the engineer, so it's
// reused across their shows.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const engineerId = Number(id);
  if (!Number.isInteger(engineerId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : '';
  await updateSoundEngineerEmail(engineerId, email);
  return NextResponse.json({ ok: true });
}
