import { NextResponse } from 'next/server';
import { getClubMember } from '@/lib/club-members';
import { setPhotographerPhotoByUserId } from '@/lib/photographers';
import { uploadToR2, isAllowedImageType } from '@/lib/r2';

// Self-serve photographer profile photo. Mirrors /api/club/account/avatar but
// writes photographers.photo for the row linked to this login (user_id), into
// the existing 'photographers' image folder. 403 if the login isn't linked to a
// photographer.
export async function POST(request: Request) {
  const member = await getClubMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json({ error: 'Use a JPEG, PNG, WebP, or GIF image' }, { status: 400 });
  }

  const url = await uploadToR2('photographers', Buffer.from(await file.arrayBuffer()), file.type);
  const linked = await setPhotographerPhotoByUserId(member.id, url);
  if (!linked) {
    return NextResponse.json({ error: 'No photographer profile linked to your account' }, { status: 403 });
  }
  return NextResponse.json({ photo: url });
}
