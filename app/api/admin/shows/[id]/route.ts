import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import {
  ISO_DATE_RE,
  isValidBandsInput,
  isValidVideosInput,
  isValidAudioInput,
  isValidPhotosInput,
  normalizePhotographerInput,
  normalizeBandIds,
  slugify,
  type Show,
} from '@/lib/shows';
import { resolveShowBandEntries, resolveVideoBandIds, setShowBands, toShowBandPairs } from '@/lib/bands';
import { resolveShowVideos, setShowVideos, setVideoBands } from '@/lib/videos';

// Maps the camelCase keys the client sends (matching the `Show` interface) to
// their snake_case columns for the plain text/URL fields. Fields with their own
// validation (date, slug, bands/videos/audio/photos, photographer, booleans)
// are handled separately below.
const TEXT_FIELD_MAP: Record<string, string> = {
  title: 'title',
  flyer: 'flyer',
  description: 'description',
  doorsTime: 'doors_time',
  showTime: 'show_time',
  rsvpUrl: 'rsvp_url',
  ticketUrl: 'ticket_url',
  externalTicketUrl: 'external_ticket_url',
  photoFolder: 'photo_folder',
  photoCredit: 'photo_credit',
  content: 'content_markdown',
};

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Plain { column, value } pairs — resolved into `tx`-bound fragments only
  // once we're inside the transaction below, since bands may need to look up
  // or create rows in the same transaction as the show write.
  const updates: Array<{ column: string; value: unknown; json?: boolean }> = [];

  for (const [clientField, column] of Object.entries(TEXT_FIELD_MAP)) {
    if (!(clientField in body)) continue;
    const value = body[clientField];
    // content_markdown is NOT NULL (defaults to ''), unlike the other nullable
    // text columns here — an empty/blank body should clear it to '', not null.
    if (clientField === 'content') {
      updates.push({ column: 'content_markdown', value: typeof value === 'string' ? value : '' });
      continue;
    }
    const trimmed = typeof value === 'string' ? value.trim() || null : null;
    if (clientField === 'title' && !trimmed) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    updates.push({ column, value: trimmed });
  }

  if ('date' in body) {
    if (typeof body.date !== 'string' || !ISO_DATE_RE.test(body.date)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    updates.push({ column: 'date', value: body.date });
  }

  if ('slug' in body) {
    const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
    if (!slug) {
      return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }
    updates.push({ column: 'slug', value: slug });
  }

  let bandsInput: Show['bands'] | undefined;
  if ('bands' in body) {
    const normalizedBands = normalizeBandIds(body.bands);
    if (!isValidBandsInput(normalizedBands)) {
      return NextResponse.json({ error: 'Invalid bands' }, { status: 400 });
    }
    bandsInput = normalizedBands;
  }

  let videosInput: unknown[] | undefined;
  if ('videos' in body) {
    const normalizedVideos = normalizeBandIds(body.videos);
    if (!isValidVideosInput(normalizedVideos)) {
      return NextResponse.json({ error: 'Invalid videos' }, { status: 400 });
    }
    videosInput = normalizedVideos as unknown[];
  }

  if ('audio' in body) {
    if (!isValidAudioInput(body.audio)) {
      return NextResponse.json({ error: 'Invalid audio' }, { status: 400 });
    }
    updates.push({ column: 'audio', value: body.audio, json: true });
  }

  if ('photos' in body) {
    if (!isValidPhotosInput(body.photos)) {
      return NextResponse.json({ error: 'Invalid photos' }, { status: 400 });
    }
    updates.push({ column: 'photos', value: body.photos, json: true });
  }

  if ('photographer' in body) {
    updates.push({ column: 'photographer', value: normalizePhotographerInput(body.photographer), json: true });
  }

  if ('rsvpForm' in body) {
    updates.push({ column: 'rsvp_form', value: Boolean(body.rsvpForm) });
  }

  if ('announced' in body) {
    updates.push({ column: 'announced', value: Boolean(body.announced) });
  }

  if (updates.length === 0 && bandsInput === undefined && videosInput === undefined) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  try {
    const row = await sql.begin(async (tx) => {
      let resolvedBands: Show['bands'] | undefined;
      if (bandsInput !== undefined) {
        resolvedBands = await resolveShowBandEntries(bandsInput, tx);
        updates.push({ column: 'bands', value: resolvedBands, json: true });
        await setShowBands(showId, toShowBandPairs(resolvedBands), tx);
      }

      if (videosInput !== undefined) {
        const resolvedVideos = resolveVideoBandIds(videosInput, resolvedBands);
        updates.push({ column: 'videos', value: resolvedVideos, json: true });
        const resolvedVideoRows = await resolveShowVideos(resolvedVideos, tx);
        await setShowVideos(showId, resolvedVideoRows, tx);
        for (const v of resolvedVideoRows) {
          await setVideoBands(v.videoId, v.bandId ? [v.bandId] : [], tx);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const assignments: any[] = updates.map((u) =>
        u.json
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? tx`${tx(u.column)} = ${tx.json(u.value as any)}`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : tx`${tx(u.column)} = ${u.value as any}`
      );
      const setClause = assignments.reduce(
        (acc, fragment) => (acc === null ? fragment : tx`${acc}, ${fragment}`),
        null
      );

      const [row] = await tx`
        update shows
        set ${setClause}, updated_at = now()
        where id = ${showId}
        returning *, date::text as date
      `;
      return row;
    });

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A show with this slug already exists' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from shows where id = ${showId}`;
  return NextResponse.json({ ok: true });
}
