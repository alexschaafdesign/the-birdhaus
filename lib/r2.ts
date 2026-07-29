import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

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
export const ALLOWED_UPLOAD_FOLDERS = ['bands', 'flyers', 'photos'] as const;
export type UploadFolder = (typeof ALLOWED_UPLOAD_FOLDERS)[number];

// Folders for non-image uploads that don't go through the image-only route —
// currently just band advance attachments (stage plots / input lists, usually
// PDFs). Kept separate so the public upload route's image validation stays tight.
export const ADVANCE_ATTACHMENTS_FOLDER = 'advance-attachments';

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function isAllowedImageType(contentType: string): boolean {
  return contentType in EXTENSION_FOR_TYPE;
}

// Uploads a file to R2 under a server-generated key (timestamp + random
// suffix + an extension derived from the validated MIME type — never the
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

  const extension = EXTENSION_FOR_TYPE[contentType];
  if (!extension) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  const client = getClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
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
