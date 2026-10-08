import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { sql } from '@/lib/db';
import { TV_FEED_TAG } from '@/lib/tv-feed';
import { ISO_DATE_RE, slugify } from '@/lib/shows';
import { requireAdmin } from '@/lib/admin-session';

// Postpone a show to a new date. Once a show is announced (or past) its date
// is frozen with its catalogue id (097), so moving it isn't an edit: this
// creates the new night as its own show — its own id, its own /shows/ URL —
// and marks the old one status = 'postponed' with rescheduled_to pointing at
// it. The old page then says "moved to …" and links the new date.
//
// Copied to the new show: what describes the night (title, times, flyer,
// description, write-up, announced, RSVP form, promoter link, ticket cap,
// assigned photographer, door person) and the lineup with set times. Not
// copied: anything tied to the old date's money or people — Square item and
// payment links (set them up again on the new show; refunds for the old one
// stay manual in Square), RSVPs, purchases, sound engineers, settlement,
// payouts, share/door tokens, media.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const showId = Number((await params).id);
  if (!Number.isInteger(showId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === 'string' ? body.date : '';
  if (!ISO_DATE_RE.test(date)) {
    return NextResponse.json({ error: 'New date is required (YYYY-MM-DD)' }, { status: 400 });
  }

  const [old] = await sql<Array<{ title: string; date: string; status: string }>>`
    select title, date::text as date, status from shows where id = ${showId}
  `;
  if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (old.status !== 'scheduled') {
    return NextResponse.json({ error: `This show is already ${old.status}` }, { status: 409 });
  }
  if (date === old.date) {
    return NextResponse.json({ error: 'Pick a different date' }, { status: 400 });
  }

  const created = await sql.begin(async (tx) => {
    // A free slug for the new date (slugs are unique; "-2", "-3" on a clash).
    const base = slugify(`${date}-${old.title}`);
    let slug = base;
    for (let n = 2; (await tx`select 1 from shows where slug = ${slug}`).length > 0; n++) {
      slug = `${base}-${n}`;
    }

    // catalogue_id is minted by the insert trigger (097).
    const [row] = await tx<Array<{ id: string; catalogue_id: string }>>`
      insert into shows (
        slug, title, date, doors_time, show_time, flyer, bands, description, rsvp_form,
        external_ticket_url, content_markdown, announced, target_band_count, door_person_name,
        ticket_limit, photographer_id
      )
      select
        ${slug}, title, ${date}, doors_time, show_time, flyer, bands, description, rsvp_form,
        external_ticket_url, content_markdown, announced, target_band_count, door_person_name,
        ticket_limit, photographer_id
      from shows where id = ${showId}
      returning id, catalogue_id
    `;
    await tx`
      insert into show_bands (show_id, band_id, sort_order, set_start, set_end)
      select ${row.id}, band_id, sort_order, set_start, set_end
      from show_bands where show_id = ${showId}
    `;
    await tx`
      update shows set status = 'postponed', rescheduled_to = ${row.id}, updated_at = now()
      where id = ${showId}
    `;
    return { id: Number(row.id), catalogueId: row.catalogue_id };
  });

  revalidatePath('/shows/[id]', 'page');
  revalidatePath('/bands/[slug]', 'page');
  revalidatePath('/shows');
  // Either date may be today's TV program.
  revalidateTag(TV_FEED_TAG, { expire: 0 });
  return NextResponse.json(created, { status: 201 });
}
