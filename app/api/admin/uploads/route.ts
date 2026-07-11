import { NextResponse } from 'next/server';
import { ALLOWED_UPLOAD_FOLDERS, isAllowedImageType, uploadToR2, type UploadFolder } from '@/lib/r2';

const MAX_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

function isUploadFolder(value: unknown): value is UploadFolder {
  return typeof value === 'string' && (ALLOWED_UPLOAD_FOLDERS as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type — please upload a JPEG, PNG, WebP, or GIF image.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 8MB).' }, { status: 400 });
  }

  const folderInput = formData.get('folder');
  const folder: UploadFolder = isUploadFolder(folderInput) ? folderInput : 'photos';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadToR2(folder, buffer, file.type);
    return NextResponse.json({ url });
  } catch (error) {
    console.error('R2 upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
