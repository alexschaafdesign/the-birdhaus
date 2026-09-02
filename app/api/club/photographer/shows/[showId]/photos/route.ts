import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { isAssignedPhotographer, addShowPhotosAsPhotographer } from '@/lib/photographers';
import { uploadToR2, isAllowedImageType } from '@/lib/r2';

// Crew photographer uploads a photo to a show they're assigned to. The photo
// goes live immediately, credited to them. One file per request (the client
// uploads sequentially for a progress counter), mirroring the admin gallery
// uploader — but gated to the assigned photographer via their club login, not
// the admin cookie. Assignment is checked BEFORE the upload so an unassigned
// login can't push images into storage.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ showId: string }> }
) {
  const member = await getClubMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { showId } = await params;
  const id = Number(showId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid show' }, { status: 400 });
  }

  if (!(await isAssignedPhotographer(id, member.id))) {
    return NextResponse.json(
      { error: "You're not the assigned photographer for this show" },
      { status: 403 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, WebP, or GIF image' }, { status: 400 });
  }

  const url = await uploadToR2('photos', Buffer.from(await file.arrayBuffer()), file.type);
  const result = await addShowPhotosAsPhotographer(id, member.id, [url]);
  if (!result.ok) {
    // Assignment was re-checked inside; a race (unassigned between the two
    // checks) lands here.
    const status = result.reason === 'no_show' ? 404 : 403;
    return NextResponse.json({ error: 'Could not add photo to this show' }, { status });
  }
  return NextResponse.json({ url });
}
