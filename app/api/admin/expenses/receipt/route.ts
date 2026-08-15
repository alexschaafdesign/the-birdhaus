import { NextResponse } from 'next/server';
import { RECEIPTS_FOLDER, uploadFileToR2 } from '@/lib/r2';

// Admin-gated by proxy.ts. Accepts a receipt image or PDF and re-hosts it on R2,
// returning its public URL + original filename to store on the expense row.
// Unlike the image-only /api/admin/uploads route this allows PDFs and stores
// the bytes as-is (no sharp re-encode) so a PDF survives intact.

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'application/pdf',
]);

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type — upload a JPEG, PNG, WebP, HEIC, or PDF.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 10MB).' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadFileToR2(RECEIPTS_FOLDER, buffer, file.type, file.name);
    return NextResponse.json({ url, filename: file.name });
  } catch (error) {
    console.error('Receipt upload failed:', error);
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 });
  }
}
