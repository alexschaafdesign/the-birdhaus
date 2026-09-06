// Private R2 bucket: members-only audio and files (Song Club tracks, Yellow
// Ostrich versions, file pins). Nothing here is ever publicly addressable —
// reads go through session-checked routes that 302 to short-TTL presigned
// GETs. Separate credentials from lib/r2.ts so the public bucket's token
// can't touch private objects (and vice versa).

import crypto from 'crypto';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { extensionFor } from './r2';

// One hour: long enough that seeking, reloads, and a full listen-through
// keep working; short enough that a leaked URL goes stale the same afternoon.
export const PRIVATE_SIGNED_GET_TTL_SECONDS = 3600;

function getPrivateBucket(): { client: S3Client; bucket: string } {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2_PRIVATE_BUCKET_NAME / R2_PRIVATE_ACCESS_KEY_ID / R2_PRIVATE_SECRET_ACCESS_KEY (+ R2_ACCOUNT_ID) are not set.'
    );
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export async function createPrivateSignedGetUrl(key: string): Promise<string> {
  const { client, bucket } = getPrivateBucket();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: PRIVATE_SIGNED_GET_TTL_SECONDS,
  });
}

// Presigned PUT with the size SIGNED IN: the browser's Content-Length must
// byte-match sizeBytes or the signature fails, which is the only client-side
// size enforcement R2 offers (no presigned-POST/content-length-range support).
// The register step still HeadObject-verifies — signing the length keeps a
// scripted client from lying about size; the head check makes the row's
// size_bytes the storage truth either way.
export async function createPrivatePresignedUploadUrl(
  folder: string,
  contentType: string,
  sizeBytes: number,
  filename?: string | null
): Promise<{ key: string; uploadUrl: string }> {
  const { client, bucket } = getPrivateBucket();
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extensionFor(filename, contentType)}`;
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes }),
    { expiresIn: 600 }
  );
  return { key, uploadUrl };
}

export async function headPrivateObject(
  key: string
): Promise<{ sizeBytes: number; contentType: string | null } | null> {
  const { client, bucket } = getPrivateBucket();
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { sizeBytes: Number(res.ContentLength ?? 0), contentType: res.ContentType ?? null };
  } catch {
    return null;
  }
}

// Small server-side uploads (pin files ≤ 4 MB, via the route body). Returns
// the object KEY — private objects have no URL to store.
export async function uploadFileToPrivateR2(
  folder: string,
  body: Buffer,
  contentType: string,
  filename?: string | null
): Promise<string> {
  const { client, bucket } = getPrivateBucket();
  const key = `${folder}/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extensionFor(filename, contentType)}`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return key;
}

// --- upload grants: bind a presigned key to the actor who requested it ---
// Register endpoints require the grant back, so member A can't register
// member B's uploaded key (or a guessed one) as their own. Stateless HMAC;
// the presign URL's own 10-min expiry bounds the window, and re-registering
// the same key trips the DB anyway.

function getGrantSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not set.');
  return secret;
}

export function createUploadGrant(key: string, actorId: number | 'admin'): string {
  return crypto.createHmac('sha256', getGrantSecret()).update(`r2upload:${key}:${actorId}`).digest('hex');
}

export function verifyUploadGrant(
  grant: string | null | undefined,
  key: string,
  actorId: number | 'admin'
): boolean {
  if (!grant) return false;
  const expected = createUploadGrant(key, actorId);
  const a = Buffer.from(grant);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
