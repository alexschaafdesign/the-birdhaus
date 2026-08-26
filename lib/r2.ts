import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import sharp from 'sharp';

declare global {
  var __birdhausR2: S3Client | undefined;
}

// Lazily created, same reasoning as lib/db.ts: `next build`'s route data
// collection imports every route module without a request context, so this
// must not throw just because R2_* isn't set at build time.
function getClient(): S3Client {
  if (globalThis.__birdhausR2) return globalThis.__birdhausR2;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not set. See .env.example for setup instructions.');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  globalThis.__birdhausR2 = client;
  return client;
}

// Whitelist of upload destinations — keeps the object key's folder under our
// control rather than letting a request pick an arbitrary path.
export const ALLOWED_UPLOAD_FOLDERS = ['bands', 'flyers', 'photos', 'song-club', 'sound-engineers', 'photographers', 'door-persons'] as const;
export type UploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

// Folders for non-image uploads that don't go through the image-only route —
// currently just band advance attachments (stage plots / input lists, usually
// PDFs). Kept separate so the public upload route's image validation stays tight.
export const ADVANCE_ATTACHMENTS_FOLDER = 'advance-attachments';

// Receipts uploaded against Admin expense-ledger rows — images or PDFs, stored
// as-is (no image re-encoding, since a PDF must survive intact). Uploaded via
// app/api/admin/expenses/receipt using uploadFileToR2.
export const RECEIPTS_FOLDER = 'receipts';

// Files members pin on the Song Club portal (lyric sheets, PDFs, images) —
// arbitrary types via uploadFileToR2, same as advance attachments.
export const SONG_CLUB_FILES_FOLDER = 'song-club-files';

// Song Club member track uploads (audio). These go DIRECT to R2 via presigned
// PUT URLs — audio blows past Vercel's ~4.5 MB request-body cap, so the file
// never touches a route handler. Requires a CORS rule on the bucket allowing
// PUT from the site origins.
export const SONG_CLUB_TRACKS_FOLDER = 'song-club-tracks';

// Yellow Ostrich in-progress song versions (audio). Same direct-to-R2
// presigned PUT flow — and the same bucket, so the existing CORS rule covers it.
export const BAND_SONGS_FOLDER = 'band-songs';

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isAllowedImageType(contentType: string): boolean {
  return contentType in EXTENSION_FOR_TYPE;
}

// Long-edge cap per upload folder, chosen from the largest on-site display
// size (retina-adjusted) for each: band photos top out around a 448px
// container (BandsGallery/bands/[slug]), flyers display up to max-w-lg with
// a lightbox-free full view, and show photos open in a full-viewport
// lightbox (PhotoGallery) so they need the most headroom.
const MAX_DIMENSION: Record<UploadFolder, number> = {
  bands: 1000,
  flyers: 1400,
  photos: 2400,
  'song-club': 1400,
  // Engineer headshots display at roughly the same size as band photos.
  'sound-engineers': 1000,
  // Photographer headshots — same as engineers.
  photographers: 1000,
  // Door-person headshots — same as engineers.
  'door-persons': 1000,
};

// Matches the site's dark background (app/layout.tsx) so a transparent PNG
// source blends in on flatten rather than turning black under JPEG.
const FLATTEN_BG = '#2A2420';

// Re-encodes an uploaded image so R2 always serves an already-sized file —
// next/image renders these `unoptimized` (see components/*), so nothing
// resizes them at request time. Honors EXIF rotation then strips it, caps
// the long edge without upscaling, and converts to JPEG. GIFs pass through
// unprocessed so animation survives (sharp would otherwise flatten to a
// single frame).
async function processUploadedImage(
  bytes: Buffer,
  contentType: string,
  maxDimension: number
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  if (contentType === 'image/gif') {
    return { buffer: bytes, contentType, extension: 'gif' };
  }

  const buffer = await sharp(bytes)
    .rotate()
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: FLATTEN_BG })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return { buffer, contentType: 'image/jpeg', extension: 'jpg' };
}

// Uploads a file to R2 under a server-generated key (timestamp + random
// suffix + an extension derived from the processed image — never the
// client's original filename, which sidesteps sanitization concerns
// entirely) and returns its public URL.
export async function uploadToR2(
  folder: UploadFolder,
  body: Buffer,
  contentType: string
): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL_BASE;
  if (!bucket || !publicBase) {
    throw new Error('R2_BUCKET_NAME / R2_PUBLIC_URL_BASE are not set. See .env.example.');
  }

  if (!EXTENSION_FOR_TYPE[contentType]) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const processed = await processUploadedImage(body, contentType, MAX_DIMENSION[folder]);

  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${processed.extension}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: processed.buffer,
      ContentType: processed.contentType,
    })
  );

  return `${publicBase.replace(/\/$/, '')}/${key}`;
}

// Derive a safe file extension for the R2 key. Prefer the original filename's
// extension (bands' attachments are arbitrary types — pdf, png, heic, txt…),
// falling back to a small content-type map, then to "bin". Only [a-z0-9] is kept
// so the extension can't smuggle path separators or other junk into the key.
function extensionFor(filename: string | null | undefined, contentType: string): string {
  const fromName = filename?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 8) return fromName;
  const fromType: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'text/plain': 'txt',
  };
  return fromType[contentType] ?? 'bin';
}

// Uploads an arbitrary file (any content type) to R2 under a server-generated
// key, returning its public URL. Unlike uploadToR2 this does NOT restrict the
// content type — used for inbound band advance attachments, which can be any
// format. The folder is a plain string (not the image UploadFolder whitelist),
// so callers must pass a controlled constant, never user input.
// Mints a short-lived presigned PUT URL so the browser can upload straight to
// R2. The key (and therefore folder) is server-generated exactly like the
// other upload paths — the client only chooses the file. Callers validate the
// content type BEFORE calling this; the signed URL locks it in (a PUT with a
// different Content-Type fails the signature).
export async function createPresignedUploadUrl(
  folder: string,
  contentType: string,
  filename?: string | null
): Promise<{ key: string; uploadUrl: string; publicUrl: string }> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL_BASE;
  if (!bucket || !publicBase) {
    throw new Error('R2_BUCKET_NAME / R2_PUBLIC_URL_BASE are not set. See .env.example.');
  }

  const extension = extensionFor(filename, contentType);
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  const uploadUrl = await getSignedUrl(
    getClient(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 600 }
  );

  return { key, uploadUrl, publicUrl: `${publicBase.replace(/\/$/, '')}/${key}` };
}

export async function uploadFileToR2(
  folder: string,
  body: Buffer,
  contentType: string,
  filename?: string | null
): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = process.env.R2_PUBLIC_URL_BASE;
  if (!bucket || !publicBase) {
    throw new Error('R2_BUCKET_NAME / R2_PUBLIC_URL_BASE are not set. See .env.example.');
  }

  const extension = extensionFor(filename, contentType);
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );

  return `${publicBase.replace(/\/$/, '')}/${key}`;
}
