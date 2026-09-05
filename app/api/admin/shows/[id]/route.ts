import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db';
import {
  ISO_DATE_RE,
  isValidBandsInput,
  isValidVideosInput,
  isValidAudioInput,
  normalizePhotosInput,
  isValidIgnoredHealthChecksInput,
  normalizePhotographerInput,
  normalizeBandIds,
  normalizeTargetBandCount,
  slugify,
  type Show,
} from '@/lib/shows';
import {
  attachTwinSceneLinks,
  resolveShowBandEntries,
  resolveVideoBandIds,
  setShowBands,
  toShowBandPairs,
} from '@/lib/bands';
import { resolveShowVideos, setShowVideos, setVideoBands } from '@/lib/videos';
import {
  isValidSoundEngineersInput,
  setShowSoundEngineers,
  type ShowSoundEngineer,
} from '@/lib/sound-engineers';
import { SITE_URL } from '@/lib/site';
import { requireAdmin } from '@/lib/admin-session';

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
  doorPersonName: 'door_person_name',
};

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
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

    // ticket_url embeds the slug for Square-managed shows — it's stored as
    // `${SITE_URL}/shows/${slug}/tickets` (see api/admin/shows/[id]/square).
    // If we don't rewrite it here, a slug change leaves ticket_url pointing at
    // the old, now-404 slug, breaking the "Buy an advance ticket" link on the
    // show page and in the RSVP confirmation email. Only rewrite our own
    // internal tiers-page URL; a manually-entered external ticket URL is left
    // untouched. This overrides the (stale) ticketUrl the edit form re-submits.
    const [current] = await sql<{ ticket_url: string | null }[]>`
      select ticket_url from shows where id = ${showId}
    `;
    const prefix = `${SITE_URL}/shows/`;
    if (current?.ticket_url?.startsWith(prefix) && current.ticket_url.endsWith('/tickets')) {
      const newTicketUrl = `${SITE_URL}/shows/${slug}/tickets`;
      const existing = updates.find((u) => u.column === 'ticket_url');
      if (existing) existing.value = newTicketUrl;
      else updates.push({ column: 'ticket_url', value: newTicketUrl });
    }
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

  let soundEngineersInput: ShowSoundEngineer[] | undefined;
  if ('soundEngineers' in body) {
    if (!isValidSoundEngineersInput(body.soundEngineers)) {
      return NextResponse.json({ error: 'Invalid sound engineers' }, { status: 400 });
    }
    soundEngineersInput = (body.soundEngineers ?? []) as ShowSoundEngineer[];
  }

  if ('audio' in body) {
    if (!isValidAudioInput(body.audio)) {
      return NextResponse.json({ error: 'Invalid audio' }, { status: 400 });
    }
    updates.push({ column: 'audio', value: body.audio, json: true });
  }

  if ('photos' in body) {
    updates.push({ column: 'photos', value: normalizePhotosInput(body.photos), json: true });
  }

  if ('assignedPhotographerId' in body) {
    const value =
      typeof body.assignedPhotographerId === 'number' && Number.isFinite(body.assignedPhotographerId)
        ? body.assignedPhotographerId
        : null;
    updates.push({ column: 'photographer_id', value, json: false });
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

  if ('advanceSent' in body) {
    updates.push({ column: 'advance_sent', value: Boolean(body.advanceSent) });
  }

  if ('targetBandCount' in body) {
    updates.push({ column: 'target_band_count', value: normalizeTargetBandCount(body.targetBandCount) });
  }

  if ('ticketLimit' in body) {
    // null / '' clears the cap (unlimited). Otherwise a non-negative integer.
    const raw = body.ticketLimit;
    if (raw === null || raw === '') {
      updates.push({ column: 'ticket_limit', value: null });
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'Invalid ticketLimit' }, { status: 400 });
      }
      updates.push({ column: 'ticket_limit', value: n });
    }
  }

  if ('ignoredHealthChecks' in body) {
    if (!isValidIgnoredHealthChecksInput(body.ignoredHealthChecks)) {
      return NextResponse.json({ error: 'Invalid ignoredHealthChecks' }, { status: 400 });
    }
    updates.push({ column: 'ignored_health_checks', value: body.ignoredHealthChecks, json: true });
  }

  if (
    updates.length === 0 &&
    bandsInput === undefined &&
    videosInput === undefined &&
    soundEngineersInput === undefined
  ) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Push any brand-new band up to Twin Scene's canonical directory before the
  // transaction (external HTTP must not run inside sql.begin), so the local
  // overlay row gets created already linked. Best-effort — see attachTwinSceneLinks.
  const linkedBands = bandsInput !== undefined ? await attachTwinSceneLinks(bandsInput) : undefined;

  try {
    const row = await sql.begin(async (tx) => {
      let resolvedBands: Show['bands'] | undefined;
      if (linkedBands !== undefined) {
        resolvedBands = await resolveShowBandEntries(linkedBands, tx);
        // TEMPORARY: dual-write for migration safety. Remove once Part C in TODO.md is executed.
        // This JSONB write is superseded by show_bands — see resolveShowBandEntries/setShowBands.
        updates.push({ column: 'bands', value: resolvedBands, json: true });
        await setShowBands(showId, toShowBandPairs(resolvedBands), tx);
      }

      if (videosInput !== undefined) {
        const resolvedVideos = resolveVideoBandIds(videosInput, resolvedBands);
        // TEMPORARY: dual-write for migration safety. Remove once Part C in TODO.md is executed.
        // This JSONB write is superseded by show_videos/band_videos — see resolveShowVideos/setShowVideos.
        updates.push({ column: 'videos', value: resolvedVideos, json: true });
        const resolvedVideoRows = await resolveShowVideos(resolvedVideos, tx);
        await setShowVideos(showId, resolvedVideoRows, tx);
        for (const v of resolvedVideoRows) {
          await setVideoBands(v.videoId, v.bandIds, tx);
        }
      }

      if (soundEngineersInput !== undefined) {
        await setShowSoundEngineers(showId, soundEngineersInput, tx);
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

      // Sound engineers live only in show_sound_engineers, so a save that touches
      // *only* them leaves `updates` empty (no shows-column assignments). Fall back
      // to bumping updated_at alone so setClause is never a null fragment.
      const [row] = setClause
        ? await tx`
            update shows
            set ${setClause}, updated_at = now()
            where id = ${showId}
            returning *, date::text as date
          `
        : await tx`
            update shows
            set updated_at = now()
            where id = ${showId}
            returning *, date::text as date
          `;
      return row;
    });

    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Show pages (and band pages, since a show edit can create/link a band)
    // are statically generated with no revalidate window — without this the
    // public site keeps serving pre-edit HTML until the next deploy.
    revalidatePath('/shows/[slug]', 'page');
    revalidatePath('/bands/[slug]', 'page');
    revalidatePath('/shows');
    revalidatePath('/bands');

    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A show with this slug already exists' }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  await sql`delete from shows where id = ${showId}`;
  revalidatePath('/shows/[slug]', 'page');
  revalidatePath('/shows');
  return NextResponse.json({ ok: true });
}
