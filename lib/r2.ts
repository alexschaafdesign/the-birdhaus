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
