import { NextResponse } from 'next/server';
import { downloadZip } from 'client-zip';
import { getClubPortalMember } from '@/lib/club-members';
import { memberRoundDownloads, trackDownloadName } from '@/lib/club-music';
import { attachmentDisposition, getPrivateObjectStream } from '@/lib/r2-private';

// "Download all" on the event page's "Your songs so far" reel: the signed-in
// member's own uploads in this round, streamed as one zip. Files are fetched
// from the private bucket one at a time as the zip is written (nothing is
// buffered whole), and stored uncompressed — audio doesn't deflate anyway.
// Names are "01 - Day 1 - Title.m4a" so the run sorts in order in Finder.
export const maxDuration = 300;

function dayNumber(day: string, start: string): number {
  return Math.round((Date.parse(day + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const member = await getClubPortalMember();
  if (!member) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const playlistId = Number((await params).id);
  if (!Number.isInteger(playlistId) || playlistId <= 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { eventTitle, eventStartDate, tracks } = await memberRoundDownloads(
    playlistId,
    Number(member.id)
  );
  if (tracks.length === 0) return NextResponse.json({ error: 'No tracks' }, { status: 404 });

  const pad = Math.max(2, String(tracks.length).length);

  async function* files() {
    for (const [i, t] of tracks.entries()) {
      const n = t.day && eventStartDate ? dayNumber(t.day, eventStartDate) : 0;
      const dayPart = n >= 1 ? `Day ${n} - ` : '';
      const name = `${String(i + 1).padStart(pad, '0')} - ${dayPart}${trackDownloadName(t.title, t)}`;
      let input: ReadableStream | Response | null = null;
      if (t.r2Key) {
        input = (await getPrivateObjectStream(t.r2Key))?.body ?? null;
      } else if (t.url) {
        const res = await fetch(t.url).catch(() => null);
        input = res?.ok ? res : null;
      }
      if (input) yield { name, input };
    }
  }

  const zipName = `${(eventTitle ?? 'Song Club').replace(/[\/\\:*?"<>|]/g, '')} - my songs.zip`;
  const zip = downloadZip(files());
  return new Response(zip.body, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': attachmentDisposition(zipName),
      'Cache-Control': 'private, no-store',
    },
  });
}
