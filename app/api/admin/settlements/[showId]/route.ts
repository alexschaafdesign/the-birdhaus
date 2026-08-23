import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { isPaidMethod, type PaidMethod } from '@/lib/settlements';

const DEAL_TYPES = ['straight_split', 'venue_guarantee_then_split'];

const NUMERIC_FIELDS = [
  'deal_threshold',
  'artist_split_pct',
  'venue_redirect_pct',
  'income_square',
  'income_venmo',
  'income_cash',
  'exp_square_fees',
  'exp_venmo_fees',
  'exp_sound_engineer',
  'exp_photos',
  'exp_door_person',
  'exp_ad_print',
  'exp_ad_online',
  'exp_snacks',
  'exp_beer',
  'beverage_income_venmo',
  'beverage_income_cash',
];

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

function toCamel(column: string): string {
  return column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function isValidExtraLineItems(value: unknown): value is Array<{ type: string; label: string; amount: number }> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      (item.type === 'income' || item.type === 'expense') &&
      typeof item.label === 'string' &&
      typeof item.amount === 'number' &&
      Number.isFinite(item.amount)
  );
}

export async function GET(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId: showIdParam } = await params;
  const showId = parseId(showIdParam);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid show id' }, { status: 400 });
  }

  const [row] = await sql`select * from settlements where show_id = ${showId}`;
  return NextResponse.json(row ?? null);
}

// Partial update for the post-show paid flags (sound engineer / photographer),
// so the Shows-list tags can be toggled without loading the whole settlement.
// Upserts a bare settlement row if none exists yet — every other column has a
// default, so show_id + the flag is enough. An optional paid-method (cash/venmo)
// rides along with each flag; unmarking always clears it.
export async function PATCH(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId: showIdParam } = await params;
  const showId = parseId(showIdParam);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid show id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const hasSound = typeof body.soundPaid === 'boolean';
  const hasPhotographer = typeof body.photographerPaid === 'boolean';
  if (!hasSound && !hasPhotographer) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const soundMethod: PaidMethod | null =
    hasSound && body.soundPaid && isPaidMethod(body.soundPaidMethod) ? body.soundPaidMethod : null;
  const photographerMethod: PaidMethod | null =
    hasPhotographer && body.photographerPaid && isPaidMethod(body.photographerPaidMethod)
      ? body.photographerPaidMethod
      : null;

  try {
    if (hasSound) {
      await sql`
        insert into settlements (show_id, sound_paid, sound_paid_method)
        values (${showId}, ${body.soundPaid}, ${soundMethod})
        on conflict (show_id) do update set
          sound_paid = ${body.soundPaid}, sound_paid_method = ${soundMethod}, updated_at = now()
      `;
    }
    if (hasPhotographer) {
      await sql`
        insert into settlements (show_id, photographer_paid, photographer_paid_method)
        values (${showId}, ${body.photographerPaid}, ${photographerMethod})
        on conflict (show_id) do update set
          photographer_paid = ${body.photographerPaid}, photographer_paid_method = ${photographerMethod}, updated_at = now()
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId: showIdParam } = await params;
  const showId = parseId(showIdParam);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid show id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const dealType = body.dealType;
  if (!DEAL_TYPES.includes(dealType)) {
    return NextResponse.json({ error: 'Invalid deal_type' }, { status: 400 });
  }

  const values: Record<string, number> = {};
  for (const column of NUMERIC_FIELDS) {
    const raw = body[toCamel(column)];
    values[column] = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
  }

  const extraLineItems = isValidExtraLineItems(body.extraLineItems) ? body.extraLineItems : [];
  const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null;
  // Whole-headcount only; anything unparseable stores null (not recorded).
  const attendance =
    typeof body.attendance === 'number' && Number.isInteger(body.attendance) && body.attendance >= 0
      ? body.attendance
      : null;
  const photographerName = typeof body.photographerName === 'string' ? body.photographerName.trim() || null : null;
  const soundEngineerName =
    typeof body.soundEngineerName === 'string' ? body.soundEngineerName.trim() || null : null;
  const soundPaid = Boolean(body.soundPaid);
  const photographerPaid = Boolean(body.photographerPaid);
  // A paid method only means something for a payment that happened.
  const soundPaidMethod = soundPaid && isPaidMethod(body.soundPaidMethod) ? body.soundPaidMethod : null;
  const photographerPaidMethod =
    photographerPaid && isPaidMethod(body.photographerPaidMethod) ? body.photographerPaidMethod : null;

  try {
    const [row] = await sql`
      insert into settlements (
        show_id, deal_type, deal_threshold, artist_split_pct, venue_redirect_pct,
        income_square, income_venmo, income_cash,
        exp_square_fees, exp_venmo_fees, exp_sound_engineer, exp_photos, exp_door_person,
        exp_ad_print, exp_ad_online, exp_snacks, exp_beer,
        beverage_income_venmo, beverage_income_cash,
        extra_line_items, notes, attendance, photographer_name, sound_engineer_name,
        sound_paid, photographer_paid, sound_paid_method, photographer_paid_method, updated_at
      ) values (
        ${showId}, ${dealType}, ${values.deal_threshold}, ${values.artist_split_pct}, ${values.venue_redirect_pct},
        ${values.income_square}, ${values.income_venmo}, ${values.income_cash},
        ${values.exp_square_fees}, ${values.exp_venmo_fees}, ${values.exp_sound_engineer}, ${values.exp_photos}, ${values.exp_door_person},
        ${values.exp_ad_print}, ${values.exp_ad_online}, ${values.exp_snacks}, ${values.exp_beer},
        ${values.beverage_income_venmo}, ${values.beverage_income_cash},
        ${sql.json(extraLineItems)}, ${notes}, ${attendance}, ${photographerName}, ${soundEngineerName},
        ${soundPaid}, ${photographerPaid}, ${soundPaidMethod}, ${photographerPaidMethod}, now()
      )
      on conflict (show_id) do update set
        deal_type = excluded.deal_type,
        deal_threshold = excluded.deal_threshold,
        artist_split_pct = excluded.artist_split_pct,
        venue_redirect_pct = excluded.venue_redirect_pct,
        income_square = excluded.income_square,
        income_venmo = excluded.income_venmo,
        income_cash = excluded.income_cash,
        exp_square_fees = excluded.exp_square_fees,
        exp_venmo_fees = excluded.exp_venmo_fees,
        exp_sound_engineer = excluded.exp_sound_engineer,
        exp_photos = excluded.exp_photos,
        exp_door_person = excluded.exp_door_person,
        exp_ad_print = excluded.exp_ad_print,
        exp_ad_online = excluded.exp_ad_online,
        exp_snacks = excluded.exp_snacks,
        exp_beer = excluded.exp_beer,
        beverage_income_venmo = excluded.beverage_income_venmo,
        beverage_income_cash = excluded.beverage_income_cash,
        extra_line_items = excluded.extra_line_items,
        notes = excluded.notes,
        attendance = excluded.attendance,
        photographer_name = excluded.photographer_name,
        sound_engineer_name = excluded.sound_engineer_name,
        sound_paid = excluded.sound_paid,
        photographer_paid = excluded.photographer_paid,
        sound_paid_method = excluded.sound_paid_method,
        photographer_paid_method = excluded.photographer_paid_method,
        updated_at = now()
      returning *
    `;
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: 'Show not found' }, { status: 404 });
    }
    throw error;
  }
}
