#!/usr/bin/env node
// scripts/delete-migrated-public-r2.mjs — the FINAL step of the private-audio
// move: after the soak (members listening via the gated routes for a while),
// delete the PUBLIC bucket's copy of every object that has a verified private
// copy. Until this runs, old public URLs still work — that's the rollback
// window; after it, the audio is truly members-only.
//
//   node scripts/delete-migrated-public-r2.mjs           # dry run: list only
//   node scripts/delete-migrated-public-r2.mjs --apply   # delete verified copies
//
// A public object is deleted ONLY when the row has r2_key AND the private
// copy head-checks identical to the public one (byte size match, plus ETag
// match when both are plain single-part MD5s). Anything that doesn't verify
// is listed and left alone. Never touches the DB beyond reads.
//
// Env: DATABASE_URL convention as migrate.mjs; public bucket via the existing
// R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME;
// private side via R2_PRIVATE_*.

import postgres from 'postgres';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { sslOptionFor } from './ssl-option.mjs';

const APPLY = process.argv.includes('--apply');

process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL is not set.'); process.exit(1); }
console.log(`db host: ${new URL(dbUrl).hostname}`);
console.log(APPLY ? 'MODE: APPLY (deleting verified public copies)\n' : 'MODE: dry run (list only)\n');

function client(accessKeyId, secretAccessKey) {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error('R2 credentials missing.');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const pub = {
  client: client(process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY),
  bucket: process.env.R2_BUCKET_NAME,
};
const priv = {
  client: client(process.env.R2_PRIVATE_ACCESS_KEY_ID, process.env.R2_PRIVATE_SECRET_ACCESS_KEY),
  bucket: process.env.R2_PRIVATE_BUCKET_NAME,
};
if (!pub.bucket || !priv.bucket) { console.error('R2_BUCKET_NAME / R2_PRIVATE_BUCKET_NAME missing.'); process.exit(1); }

async function head(side, key) {
  try {
    const res = await side.client.send(new HeadObjectCommand({ Bucket: side.bucket, Key: key }));
    return { size: Number(res.ContentLength), etag: (res.ETag ?? '').replace(/"/g, '') };
  } catch { return null; }
}

const PUBLIC_BASE = (process.env.R2_PUBLIC_URL_BASE ?? 'https://images.thebirdhaus.org').replace(/\/$/, '');
const TABLES = ['song_club_tracks', 'band_song_versions', 'song_club_pins'];

const sql = postgres(dbUrl, { ssl: sslOptionFor(dbUrl), max: 1 });
let deleted = 0, kept = 0, planned = 0;
try {
  for (const table of TABLES) {
    const rows = await sql`
      select id, url, r2_key from ${sql(table)}
      where r2_key is not null and url is not null
      order by id asc
    `;
    console.log(`── ${table}: ${rows.length} migrated row(s) still holding a public url`);
    for (const row of rows) {
      if (!row.url.startsWith(`${PUBLIC_BASE}/`)) { console.log(`   keep #${row.id}: url not on the public base`); kept++; continue; }
      const publicKey = row.url.slice(PUBLIC_BASE.length + 1);
      const [pubHead, privHead] = await Promise.all([head(pub, publicKey), head(priv, row.r2_key)]);
      if (!privHead) { console.log(`   keep #${row.id}: PRIVATE copy missing (${row.r2_key}) — investigate`); kept++; continue; }
      if (!pubHead) { console.log(`   ok   #${row.id}: public copy already gone`); continue; }
      const md5ish = (e) => /^[0-9a-f]{32}$/.test(e);
      const sizeOk = pubHead.size === privHead.size;
      const etagOk = md5ish(pubHead.etag) && md5ish(privHead.etag) ? pubHead.etag === privHead.etag : true;
      if (!sizeOk || !etagOk) {
        console.log(`   keep #${row.id}: MISMATCH (size ${pubHead.size}/${privHead.size}, etag ${pubHead.etag}/${privHead.etag}) — investigate`);
        kept++;
        continue;
      }
      if (!APPLY) { console.log(`   plan #${row.id}: delete public ${publicKey}`); planned++; continue; }
      await pub.client.send(new DeleteObjectCommand({ Bucket: pub.bucket, Key: publicKey }));
      console.log(`   del  #${row.id}: ${publicKey}`);
      deleted++;
    }
  }
} finally {
  await sql.end();
}
console.log(`\n${APPLY ? `deleted ${deleted}` : `planned ${planned}`}, kept ${kept}`);
