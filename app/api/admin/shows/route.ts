import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import {
  ISO_DATE_RE,
  isValidBandsInput,
  isValidVideosInput,
  isValidAudioInput,
  isValidPhotosInput,
  normalizePhotographerInput,
  normalizeBandIds,
  normalizeTargetBandCount,
  slugify,
  bandsJoinFragment,
  videosJoinFragment,
} from '@/lib/shows';
import { resolveShowBandEntries, resolveVideoBandIds, setShowBands, toShowBandPairs } from '@/lib/bands';
import { resolveShowVideos, setShowVideos, setVideoBands } from '@/lib/videos';
import {
  isValidSoundEngineersInput,
  setShowSoundEngineers,
  type ShowSoundEngineer,
} from '@/lib/sound-engineers';

export async function GET() {
  const rows = await sql`
    select *, date::text as date, ${bandsJoinFragment()}, ${videosJoinFragment()}
    from shows
    order by shows.date desc
  `;
  return NextResponse.json(rows);
}

function nullableTrim(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const title = nullableTrim(body?.title);
  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const date = typeof body?.date === 'string' ? body.date : '';
  if (!ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  const slugInput = nullableTrim(body?.slug);
  const slug = slugify(slugInput || `${date}-${title}`);
  if (!slug) {
    return NextResponse.json({ error: 'Could not derive a slug from title/date' }, { status: 400 });
  }

  const bands = normalizeBandIds(body?.bands === undefined ? [] : body.bands);
  if (!isValidBandsInput(bands)) {
    return NextResponse.json({ error: 'Invalid bands' }, { status: 400 });
  }

  const videos = normalizeBandIds(body?.videos === undefined ? [] : body.videos);
  if (!isValidVideosInput(videos)) {
    return NextResponse.json({ error: 'Invalid videos' }, { status: 400 });
  }

  const audio = body?.audio === undefined ? [] : body.audio;
  if (!isValidAudioInput(audio)) {
    return NextResponse.json({ error: 'Invalid audio' }, { status: 400 });
  }

  const photos = body?.photos === undefined ? [] : body.photos;
  if (!isValidPhotosInput(photos)) {
    return NextResponse.json({ error: 'Invalid photos' }, { status: 400 });
  }

  const soundEngineers = body?.soundEngineers ?? [];
  if (!isValidSoundEngineersInput(soundEngineers)) {
    return NextResponse.json({ error: 'Invalid sound engineers' }, { status: 400 });
  }

  const photographer = normalizePhotographerInput(body?.photographer);
  const rsvpForm = body?.rsvpForm === undefined ? true : Boolean(body.rsvpForm);
  const announced = Boolean(body?.announced);
  const targetBandCount = normalizeTargetBandCount(body?.targetBandCount);
  const advanceSent = Boolean(body?.advanceSent);

  try {
    const row = await sql.begin(async (tx) => {
      const resolvedBands = await resolveShowBandEntries(bands, tx);
      const resolvedVideos = resolveVideoBandIds(videos, resolvedBands);
      const resolvedVideoRows = await resolveShowVideos(resolvedVideos, tx);

      // TEMPORARY: dual-write for migration safety. Remove once Part C in TODO.md is executed.
      // This JSONB write is superseded by show_bands — see resolveShowBandEntries/setShowBands.
      const bandsJson = tx.json(resolvedBands);
      // TEMPORARY: dual-write for migration safety. Remove once Part C in TODO.md is executed.
      // This JSONB write is superseded by show_videos/band_videos — see resolveShowVideos/setShowVideos.
      const videosJson = tx.json(resolvedVideos);

      const [row] = await tx`
        insert into shows (
          slug, title, date, doors_time, show_time, flyer, bands, description,
          photographer, rsvp_url, ticket_url, external_ticket_url, rsvp_form,
          videos, audio, photos, photo_folder, photo_credit, content_markdown, announced,
          sound_engineer_name, target_band_count, advance_sent
        )
        values (
          ${slug}, ${title}, ${date}, ${nullableTrim(body.doorsTime)}, ${nullableTrim(body.showTime)},
          ${nullableTrim(body.flyer)}, ${bandsJson}, ${nullableTrim(body.description)},
          ${tx.json(photographer)}, ${nullableTrim(body.rsvpUrl)}, ${nullableTrim(body.ticketUrl)},
          ${nullableTrim(body.externalTicketUrl)}, ${rsvpForm},
          ${videosJson}, ${tx.json(audio)}, ${tx.json(photos)},
          ${nullableTrim(body.photoFolder)}, ${nullableTrim(body.photoCredit)},
          ${typeof body.content === 'string' ? body.content : ''}, ${announced},
          ${nullableTrim(body.soundEngineerName)}, ${targetBandCount}, ${advanceSent}
        )
        returning *, date::text as date
      `;
      await setShowBands(Number(row.id), toShowBandPairs(resolvedBands), tx);
      await setShowVideos(Number(row.id), resolvedVideoRows, tx);
      for (const v of resolvedVideoRows) {
        await setVideoBands(v.videoId, v.bandIds, tx);
      }
      await setShowSoundEngineers(Number(row.id), soundEngineers as ShowSoundEngineer[], tx);
      return row;
    });
    revalidatePath('/shows/[slug]', 'page');
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/shows');
    revalidatePath('/bands');
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A show with this slug already exists' }, { status: 409 });
    }
    throw error;
  }
}
