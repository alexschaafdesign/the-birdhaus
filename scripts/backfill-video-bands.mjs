// One-time backfill: for each video that's missing a title, fetches its real
// title from YouTube (the public oEmbed endpoint — no API key needed) and
// saves it, then tries to match that title against the bands in that same
// show's own lineup (case-insensitive substring match) — scoped to just that
// show's bands, not the whole registry, so it's far less likely to guess
// wrong. Ambiguous matches (zero or multiple candidate bands) are left
// unassigned and reported for manual follow-up via the show form's band
// dropdown on each video row.
//
// Usage:
//   node scripts/backfill-video-bands.mjs             (writes to the DB)
//   node scripts/backfill-video-bands.mjs --dry-run   (fetches titles + prints a summary, no DB writes)
//
// Safe to re-run: videos that already have both a title and a bandId are left untouched.
import path from 'path';
import postgres from 'postgres';
import { sslOptionFor } from './ssl-option.mjs';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // no .env.local — fall back to whatever is already in the environment
}

const dryRun = process.argv.slice(2).includes('--dry-run');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: sslOptionFor(connectionString) });

async function fetchYouTubeTitle(youtubeId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${youtubeId}`
  )}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.title === 'string' ? data.title : null;
}

try {
  const shows = await sql`select id, title, bands, videos from shows order by date asc`;

  let titlesFetched = 0;
  let titlesFailed = 0;
  let matched = 0;
  let alreadyLinked = 0;
  const unmatched = [];
  let showsUpdated = 0;

  for (const show of shows) {
    const candidates = (show.bands ?? [])
      .filter((raw) => typeof raw !== 'string' && raw?.name && raw?.bandId)
      .map((b) => ({ name: b.name, bandId: b.bandId }));

    let changed = false;
    const nextVideos = [];

    for (const video of show.videos ?? []) {
      let title = video.title;

      if (!title || !title.trim()) {
        const fetched = await fetchYouTubeTitle(video.youtube).catch(() => null);
        if (fetched) {
          title = fetched;
          titlesFetched += 1;
          changed = true;
        } else {
          titlesFailed += 1;
        }
      }

      if (video.bandId) {
        alreadyLinked += 1;
        nextVideos.push(title !== video.title ? { ...video, title } : video);
        continue;
      }

      if (!title || !title.trim()) {
        unmatched.push({ showTitle: show.title, videoId: video.youtube, reason: 'could not fetch a title' });
        nextVideos.push(video);
        continue;
      }

      const lowerTitle = title.toLowerCase();
      const hits = candidates.filter((c) => lowerTitle.includes(c.name.toLowerCase()));

      if (hits.length === 1) {
        matched += 1;
        changed = true;
        nextVideos.push({ ...video, title, bandId: hits[0].bandId });
      } else {
        unmatched.push({
          showTitle: show.title,
          videoTitle: title,
          reason: hits.length === 0 ? 'no band name found in title' : `ambiguous (${hits.length} bands match)`,
        });
        nextVideos.push(title !== video.title ? { ...video, title } : video);
      }
    }

    if (changed) {
      showsUpdated += 1;
      if (!dryRun) {
        await sql`update shows set videos = ${sql.json(nextVideos)} where id = ${show.id}`;
      }
    }
  }

  console.log(`Fetched ${titlesFetched} title(s) from YouTube (${titlesFailed} failed/unavailable).`);
  console.log(`${dryRun ? 'Would match' : 'Matched'} ${matched} video(s) to a band across ${showsUpdated} show(s).`);
  console.log(`${alreadyLinked} video(s) already had a bandId (left untouched).`);
  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} video(s) left unmatched — fix these by hand via the show form's band dropdown:`);
    for (const { showTitle, videoTitle, videoId, reason } of unmatched) {
      console.log(`  - "${videoTitle ?? videoId}" (${showTitle}) — ${reason}`);
    }
  } else {
    console.log('\nNo unmatched videos.');
  }
} finally {
  await sql.end();
}
