import { NextResponse } from 'next/server';
import { getClubMember, setAvatar } from '@/lib/club-members';
import { uploadToR2, isAllowedImageType } from '@/lib/r2';

// Avatar upload: reuses the image pipeline (resize/re-encode) into the
// existing 'song-club' image folder. Small images, so the 4.5 MB route-body
// cap is fine here — no presigned flow needed.
export async function POST(request: Request) {
  const member = await getClubMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 });
  }
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json({ error: 'Use a JP, PNG, WebP, or GIF image' }, { status: 400 });
  }

  const url = await uploadToR2('song-club', Buffer.from(await file.arrayBuffer()), file.type);
  await setAvatar(member.id, url);
  return NextResponse.json({ avatarUrl: url });
}
