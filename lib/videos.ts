import postgres from 'postgres';
import type { Show } from './shows';

type Tx = postgres.TransactionSql;

export interface ResolvedVideo {
  videoId: number;
  bandIds: number[];
  sortOrder: number;
}

// Resolves each show video entry to a real videos.id, creating a new video
// row for any youtube id that doesn't already match one. Mirrors
// resolveShowBandEntries: matches by youtube (videos' natural key) rather than
// name, and — like that function — never overwrites an existing row's title
// from a later request that happens to reuse the same youtube id.
export async function resolveShowVideos(videos: Show['videos'], tx: Tx): Promise<ResolvedVideo[]> {
  const resolved: ResolvedVideo[] = [];

  for (const [index, raw] of videos.entries()) {
    const youtube = raw.youtube.trim();
    const title = raw.title.trim();

    const [existing] = await tx<Array<{ id: number }>>`
      select id from videos where youtube = ${youtube} limit 1
    `;

    const videoId = existing
      ? Number(existing.id)
      : Number(
          (
            await tx<Array<{ id: number }>>`
              insert into videos (youtube, title) values (${youtube}, ${title}) returning id
            `
          )[0].id
        );

    resolved.push({ videoId, bandIds: raw.bandIds ?? [], sortOrder: index });
  }

  return resolved;
}

// Replaces a show's show_videos rows wholesale — same delete-and-reinsert
// approach as setShowBands(). Runs in the same transaction as the show save,
// alongside (not replacing) the existing videos JSONB write.
export async function setShowVideos(showId: number, videos: ResolvedVideo[], tx: Tx): Promise<void> {
  await tx`delete from show_videos where show_id = ${showId}`;
  if (videos.length === 0) return;
  const rows = videos.map((v) => ({ show_id: showId, video_id: v.videoId, sort_order: v.sortOrder }));
  await tx`insert into show_videos ${tx(rows, 'show_id', 'video_id', 'sort_order')}`;
}

// Tags a video with one or more bands, replacing whatever band_videos rows it
// currently has — same wholesale delete-and-reinsert pattern, scoped to one
// video instead of one show. New capability: a video can now be tagged to
// several bands (e.g. a multi-band-bill video), not just the single bandId
// the show form has ever captured — this is the primitive a future multi-band
// tagging UI would call directly; today only the single-bandId path below uses it.
export async function setVideoBands(videoId: number, bandIds: number[], tx: Tx): Promise<void> {
  await tx`delete from band_videos where video_id = ${videoId}`;
  if (bandIds.length === 0) return;
  const rows = bandIds.map((bandId, index) => ({ band_id: bandId, video_id: videoId, sort_order: index }));
  await tx`insert into band_videos ${tx(rows, 'band_id', 'video_id', 'sort_order')}`;
}
