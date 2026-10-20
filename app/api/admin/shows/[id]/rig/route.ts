import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-session';
import { getShowRecording, parseRecordingInput, saveShowRecording } from '@/lib/show-rig';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

// Saves the Recording section of the Contacts tab: rig counts (show_rig) and
// the ordered camera operators (show_credits, role 'camera'), all at once.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const input = parseRecordingInput(await request.json().catch(() => null));
  if ('error' in input) return NextResponse.json({ error: input.error }, { status: 400 });

  try {
    await saveShowRecording(showId, input);
  } catch (error) {
    if (error instanceof Error && error.message === 'unknown account') {
      return NextResponse.json(
        { error: 'A linked account is no longer a crew or staff account — pick another or unlink it.' },
        { status: 400 }
      );
    }
    // show_rig / show_credits reference shows(id).
    if (error instanceof Error && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    throw error;
  }
  return NextResponse.json(await getShowRecording(showId));
}
