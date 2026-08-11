import { NextResponse } from 'next/server';
import { getShowIdByShareToken } from '@/lib/share-token';
import { recordPortalStagePlot } from '@/lib/hub-portal';

// PUBLIC route — no admin session. Authorization is possession of the show's
// unguessable share token (see proxy.ts: only /admin + /api/admin are gated).
// A band uploads its stage plot / input-list file here from the /hub portal.

// Stage plots / input lists come as PDFs or images. Allowlisted so the public
// endpoint can't be used to stash arbitrary file types in our bucket.
const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
]);
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const showId = await getShowIdByShareToken(token);
  if (showId === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const bandId = Number(formData.get('bandId'));
  if (!Number.isInteger(bandId)) {
    return NextResponse.json({ error: 'Pick your band first.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Please upload a PDF or an image (JPEG, PNG, WebP, GIF, HEIC).' },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 15MB).' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    // recordPortalStagePlot re-validates bandId is in this show's lineup and
    // returns null if not — so a token for show A can't attach to show B's band.
    const result = await recordPortalStagePlot({
      showId,
      bandId,
      filename: file.name || 'stage-plot',
      contentType: file.type,
      buffer,
    });
    if (!result) {
      return NextResponse.json({ error: "That band isn't on this show." }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[hub] stage-plot upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
