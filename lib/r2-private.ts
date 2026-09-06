// Private R2 bucket: members-only audio and files (Song Club tracks, Yellow
// Ostrich versions, file pins). Nothing here is ever publicly addressable —
// reads go through session-checked routes that 302 to short-TTL presigned
// GETs. Separate credentials from lib/r2.ts so the public bucket's token
// can't touch private objects (and vice versa).

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
