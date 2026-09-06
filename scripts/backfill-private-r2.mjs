#!/usr/bin/env node
// scripts/backfill-private-r2.mjs — copy members-only audio/files from the
// public R2 bucket into the private one and record each row's r2_key.
//
//   node scripts/backfill-private-r2.mjs           # dry run: plan only
//   node scripts/backfill-private-r2.mjs --apply   # copy + verify + write r2_key
//
// Scope: song_club_tracks (song-club-tracks/), band_song_versions
// (band-songs/), song_club_pins kind='file' (song-club-files/). Rows whose url
// doesn't match the public base + expected folder are listed and skipped.
//
// NEVER deletes anything. Idempotent: a row with r2_key set is re-HEAD-checked
// in the private bucket and skipped when the object is there; a missing object
// gets re-copied. Verification = local MD5 of the downloaded bytes vs the
// private PUT's ETag (single-part PUT ⇒ ETag is the MD5) + byte length.
//
// Env: DATABASE_URL convention as migrate.mjs (dev by default; prod via
// one-off DATABASE_URL prefix). Private bucket: R2_ACCOUNT_ID +
// R2_PRIVATE_BUCKET_NAME / R2_PRIVATE_ACCESS_KEY_ID / R2_PRIVATE_SECRET_ACCESS_KEY.

import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { sslOptionFor } from './ssl-option.mjs';

const APPLY = process.argv.includes('--apply');

process.loadEnvFile(new URL('../.env.local', import.meta.url).pathname);
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.error('DATABASE_URL is not set.'); process.exit(1); }
console.log(`db host: ${new URL(dbUrl).hostname}`);
console.log(APPLY ? 'MODE: APPLY (copy + write r2_key)\n' : 'MODE: dry run (no copies, no writes)\n');

const PUBLIC_BASE = (process.env.R2_PUBLIC_URL_BASE ?? 'https://images.thebirdhaus.org').replace(/\/$/, '');

function getPrivate() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_PRIVATE_BUCKET_NAME;
  const accessKeyId = process.env.R2_PRIVATE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_PRIVATE_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_PRIVATE_* env vars are not set (bucket/access key/secret + R2_ACCOUNT_ID).');
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

const TARGETS = [
  { table: 'song_club_tracks', folder: 'song-club-tracks', where: sqlv => sqlv`` },
  { table: 'band_song_versions', folder: 'band-songs', where: sqlv => sqlv`` },
  { table: 'song_club_pins', folder: 'song-club-files', where: sqlv => sqlv`and kind = 'file'` },
];

const sql = postgres(dbUrl, { ssl: sslOptionFor(dbUrl), max: 1 });
let priv = null;
try { priv = getPrivate(); }
catch (err) {
  if (APPLY) { console.error(String(err.message ?? err)); process.exit(1); }
  console.log(`(note: ${err.message} — dry run continues without HEAD checks)\n`);
}

async function headPrivate(key) {
  try {
    const res = await priv.client.send(new HeadObjectCommand({ Bucket: priv.bucket, Key: key }));
    return { size: Number(res.ContentLength), etag: (res.ETag ?? '').replace(/"/g, '') };
  } catch { return null; }
}

let copied = 0, skipped = 0, planned = 0, failed = 0;
try {
  for (const t of TARGETS) {
    const rows = await sql`
      select id, url, r2_key from ${sql(t.table)}
      where url is not null ${t.where(sql)}
      order by id asc
    `;
    console.log(`── ${t.table}: ${rows.length} row(s) with a url`);
    for (const row of rows) {
      const prefix = `${PUBLIC_BASE}/${t.folder}/`;
      if (!row.url.startsWith(prefix)) {
        console.log(`   skip #${row.id}: url not under ${t.folder}/ (${row.url.slice(0, 60)}…)`);
        skipped++;
        continue;
      }
      const key = row.url.slice(PUBLIC_BASE.length + 1);

      if (row.r2_key) {
        const head = priv ? await headPrivate(row.r2_key) : undefined;
        if (head === undefined) { console.log(`   #${row.id}: r2_key set (no creds to verify)`); skipped++; continue; }
        if (head) { console.log(`   ok  #${row.id}: already migrated (${key})`); skipped++; continue; }
        console.log(`   !!  #${row.id}: r2_key set but object MISSING in private bucket — re-copying`);
      }

      if (!APPLY) { console.log(`   plan #${row.id}: copy ${key}`); planned++; continue; }

      const res = await fetch(row.url);
      if (!res.ok) { console.error(`   FAIL #${row.id}: GET ${row.url} → ${res.status}`); failed++; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const md5 = createHash('md5').update(buf).digest('hex');
      const contentType = res.headers.get('content-type') ?? 'application/octet-stream';

      const put = await priv.client.send(new PutObjectCommand({
        Bucket: priv.bucket, Key: key, Body: buf,
        ContentType: contentType, ContentLength: buf.length,
      }));
      const putEtag = (put.ETag ?? '').replace(/"/g, '');
      const head = await headPrivate(key);
      if (!head || head.size !== buf.length || putEtag !== md5) {
        console.error(`   FAIL #${row.id}: verify mismatch (size ${head?.size} vs ${buf.length}, etag ${putEtag} vs md5 ${md5}) — r2_key NOT written`);
        failed++;
        continue;
      }
      await sql`update ${sql(t.table)} set r2_key = ${key} where id = ${row.id}`;
      console.log(`   done #${row.id}: ${key} (${(buf.length / 1024 / 1024).toFixed(1)} MB, verified)`);
      copied++;
    }
  }
} finally {
  await sql.end();
}
console.log(`\n${APPLY ? `copied+verified ${copied}` : `planned ${planned}`}, skipped ${skipped}, failed ${failed}`);
if (failed > 0) process.exit(1);
