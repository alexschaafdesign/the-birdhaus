import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAdminSession } from '@/lib/admin-session';
import { createPin, getPins, type ClubPinKind } from '@/lib/club-board';
import { isValidHttpUrl } from '@/lib/club-embed';
import { uploadFileToR2, SONG_CLUB_FILES_FOLDER } from '@/lib/r2';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// Vercel route handlers cap request bodies around 4.5 MB, so that's the file
// ceiling too — the portal UI steers audio toward Samply/Bandcamp embeds.
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Pin something to the portal. Two shapes:
//  - multipart/form-data with `file` + `title`  -> re-hosted in R2, kind 'file'
//  - JSON { kind: 'embed' | 'link', title, url } -> stored as-is
export async function POST(request: Request) {
  const member = await getClubMember();
  const author = member ? member.id : (await isAdminSession()) ? ('admin' as const) : null;
  if (author === null) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await checkRateLimit(`club-pin:${getClientIp(request)}`, 20, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many pins at once — wait a few minutes.' },
      { status: 429 }
    );
  }

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.startsWith('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'Files can be up to 4 MB. For audio, pin a Samply or Bandcamp link instead.' },
        { status: 400 }
      );
    }
    const rawTitle = form?.get('title');
    const title = (typeof rawTitle === 'string' ? rawTitle.trim() : '') || file.name;

    const url = await uploadFileToR2(
      SONG_CLUB_FILES_FOLDER,
      Buffer.from(await file.arrayBuffer()),
      file.type || 'application/octet-stream',
      file.name
    );
    await createPin({
      author,
      kind: 'file',
      title,
      url,
      contentType: file.type || null,
      sizeBytes: file.size,
    });
    return NextResponse.json({ pins: await getPins() });
  }

  const body = await request.json().catch(() => null);
  const kind = body?.kind === 'embed' || body?.kind === 'link' ? (body.kind as ClubPinKind) : null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!kind || !title || !isValidHttpUrl(url)) {
    return NextResponse.json({ error: 'A title and a valid link are required' }, { status: 400 });
  }

  await createPin({ author, kind, title, url });
  return NextResponse.json({ pins: await getPins() });
}
