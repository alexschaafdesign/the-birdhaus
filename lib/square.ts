// lib/square.ts — best-effort sync of a Birdhaus show to a Square Catalog EVENT
// item plus one Payment Link per donation tier. Gated behind SQUARE_SYNC_ENABLED
// and defaults OFF: there is no Square Sandbox support for the Catalog API, so
// local dev must never hit the live API by accident.
//
// Env (loaded from .env.local for local dev / one-off scripts; in Next/Vercel
// the file is absent and these come from the platform):
//   SQUARE_ACCESS_TOKEN     - Bearer token
//   SQUARE_LOCATION_ID      - location for the payment-link orders
//   SQUARE_VENUE_ADDRESS_ID - existing catalog ADDRESS id, reused as-is (never recreated)
//   SQUARE_SYNC_ENABLED     - "true" to actually call Square; anything else = skip

import { sql } from './db';

try {
  // Populate process.env from .env.local when running locally. In production the
  // file is absent and env is already injected, so swallow the ENOENT.
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local here — rely on the already-present process.env
}

const SQUARE_VERSION = '2026-07-15';
const SQUARE_BASE = 'https://connect.squareup.com';
const EVENT_TIME_ZONE = 'America/Chicago';
const EVENT_DURATION_HOURS = 4; // matches the confirmed real item (7pm doors -> 11pm end)

// Donation tiers are hardcoded constants for this slice — Postgres has no
// per-show price/cover concept yet.
const TIERS = [
  { key: 'reduced', label: 'Reduced donation ($10)', amountCents: 1000 },
  { key: 'standard', label: 'Standard donation ($20)', amountCents: 2000 },
  { key: 'topTier', label: 'Top-tier donation ($30)', amountCents: 3000 },
] as const;

export type ShowInput = {
  id: number | string;
  title: string;
  date: string; // YYYY-MM-DD, the local venue date
  doors_time?: string | null;
  show_time?: string | null;
  flyer?: string | null; // public image URL; uploaded to Square as the item photo
};

export type ShowTierResult = {
  tierLabel: string;
  amountCents: number;
  variationId: string;
  paymentLinkId: string;
  orderId: string | null;
  url: string | null;
};

export type SyncShowResult = {
  itemId: string;
  imageId: string | null;
  tiers: ShowTierResult[];
};

type CatalogImageResponse = {
  image?: { id: string };
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[square] missing required env ${name}`);
  return value;
}

type CatalogUpsertResponse = {
  id_mappings?: { client_object_id: string; object_id: string }[];
};

type PaymentLinkResponse = {
  payment_link?: { id: string; order_id?: string; url?: string };
};

async function squareFetch<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    ...init,
    headers: {
      'Square-Version': SQUARE_VERSION,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`[square] ${init.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// Fetch a show flyer by URL and upload the raw bytes to Square as a catalog
// IMAGE, attached to `itemId` as its primary photo. Square requires the actual
// bytes (not a URL); shows.flyer is a public CDN URL, so we just stream it.
async function uploadFlyer(itemId: string, flyerUrl: string, showId: number | string, token: string): Promise<string> {
  const img = await fetch(flyerUrl);
  if (!img.ok) throw new Error(`[square] could not fetch flyer ${flyerUrl}: ${img.status}`);
  const bytes = new Uint8Array(await img.arrayBuffer());
  const contentType = img.headers.get('content-type') ?? 'image/png';

  const form = new FormData();
  form.append(
    'request',
    new Blob(
      [
        JSON.stringify({
          idempotency_key: `show-image-${showId}`,
          object_id: itemId,
          is_primary: true,
          image: { type: 'IMAGE', id: '#flyer', image_data: { caption: 'Show flyer' } },
        }),
      ],
      { type: 'application/json' },
    ),
  );
  form.append('file', new Blob([bytes], { type: contentType }), 'flyer');

  // Not squareFetch: multipart must NOT carry a JSON Content-Type — fetch sets
  // the multipart boundary itself when given a FormData body.
  const res = await fetch(`${SQUARE_BASE}/v2/catalog/images`, {
    method: 'POST',
    headers: { 'Square-Version': SQUARE_VERSION, Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`[square] image upload failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as CatalogImageResponse;
  if (!data.image?.id) throw new Error('[square] image upload returned no image id');
  return data.image.id;
}

// --- local wall time -> UTC, DST-correct (no hardcoded offset) ----------------
function parseLocalTime(raw: string | null | undefined): { hour: number; minute: number } | null {
  if (!raw) return null;
  const text = raw.trim();
  const m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i) ?? text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm) {
    if (hour === 12) hour = 0;
    if (ampm === 'p') hour += 12;
  }
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// How far ahead of UTC the zone is, in ms, at the given instant.
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - date.getTime();
}

// Interpret (dateStr, hour, minute) as a wall-clock time in timeZone and return
// the corresponding UTC instant. Two passes so DST transitions resolve cleanly.
function wallTimeToUtc(dateStr: string, hour: number, minute: number, timeZone: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, hour, minute);
  let offset = tzOffsetMs(timeZone, new Date(guess));
  offset = tzOffsetMs(timeZone, new Date(guess - offset));
  return new Date(guess - offset);
}

function computeEventWindow(show: ShowInput): { startAt: string; endAt: string } {
  // The confirmed real item used the 7pm doors time as the event start, so
  // prefer doors_time and fall back to show_time.
  const local = parseLocalTime(show.doors_time) ?? parseLocalTime(show.show_time);
  if (!local) {
    throw new Error(`[square] show ${show.id} has no parseable doors_time/show_time for the event start`);
  }
  const start = wallTimeToUtc(show.date, local.hour, local.minute, EVENT_TIME_ZONE);
  const end = new Date(start.getTime() + EVENT_DURATION_HOURS * 3_600_000);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export async function syncShowToSquare(show: ShowInput): Promise<SyncShowResult | undefined> {
  if (process.env.SQUARE_SYNC_ENABLED !== 'true') {
    console.log('[square] sync disabled, skipping');
    return;
  }

  try {
    const token = requireEnv('SQUARE_ACCESS_TOKEN');
    const locationId = requireEnv('SQUARE_LOCATION_ID');
    const addressId = requireEnv('SQUARE_VENUE_ADDRESS_ID');

    const { startAt, endAt } = computeEventWindow(show);

    // 1) One batch-upsert: an EVENT item carrying the three donation-tier variations.
    const ITEM_TMP = '#show-item';
    const catalogBody = {
      idempotency_key: `show-catalog-${show.id}`,
      batches: [
        {
          objects: [
            {
              type: 'ITEM',
              id: ITEM_TMP,
              item_data: {
                name: show.title,
                product_type: 'EVENT',
                event: {
                  start_at: startAt,
                  end_at: endAt,
                  event_location_time_zone: EVENT_TIME_ZONE,
                  event_location_types: ['IN_PERSON'],
                  address_id: addressId,
                  all_day_event: false,
                },
                variations: TIERS.map((t) => ({
                  type: 'ITEM_VARIATION',
                  id: `#tier-${t.key}`,
                  item_variation_data: {
                    item_id: ITEM_TMP,
                    name: t.label,
                    pricing_type: 'FIXED_PRICING',
                    price_money: { amount: t.amountCents, currency: 'USD' },
                  },
                })),
              },
            },
          ],
        },
      ],
    };

    const catalogRes = await squareFetch<CatalogUpsertResponse>(
      '/v2/catalog/batch-upsert',
      { method: 'POST', body: JSON.stringify(catalogBody) },
      token,
    );

    const mappings: Record<string, string> = {};
    for (const m of catalogRes.id_mappings ?? []) {
      mappings[m.client_object_id] = m.object_id;
    }
    const itemId = mappings[ITEM_TMP];
    if (!itemId) throw new Error('[square] batch-upsert returned no item id mapping');

    // 2) One Payment Link per tier (Order Checkout mode).
    const tiers: ShowTierResult[] = [];
    for (const t of TIERS) {
      const variationId = mappings[`#tier-${t.key}`];
      if (!variationId) throw new Error(`[square] no variation id mapping for tier ${t.key}`);
      const linkRes = await squareFetch<PaymentLinkResponse>(
        '/v2/online-checkout/payment-links',
        {
          method: 'POST',
          body: JSON.stringify({
            idempotency_key: `show-link-${show.id}-${t.key}`,
            order: {
              location_id: locationId,
              line_items: [{ catalog_object_id: variationId, quantity: '1' }],
            },
          }),
        },
        token,
      );
      const link = linkRes.payment_link;
      if (!link?.id) throw new Error(`[square] payment-link create returned no link id for tier ${t.key}`);
      tiers.push({
        tierLabel: t.label,
        amountCents: t.amountCents,
        variationId,
        paymentLinkId: link.id,
        orderId: link.order_id ?? null,
        url: link.url ?? null,
      });
    }

    // 3) Attach the flyer as the item photo if the show has one. Absent flyers
    // are fine — the caller can attach one later via attachShowFlyerToSquare.
    const imageId = show.flyer ? await uploadFlyer(itemId, show.flyer, show.id, token) : null;

    return { itemId, imageId, tiers };
  } catch (err) {
    // Add context, then let it propagate — the caller decides whether a Square
    // failure should block anything (the show handler treats it as best-effort).
    console.error(`[square] sync failed for show ${show.id}`, err);
    throw err;
  }
}

// Whether Square writes are turned on in this environment. Off by default so
// local dev never hits the live Catalog API (no Sandbox support for it).
export function isSquareSyncEnabled(): boolean {
  return process.env.SQUARE_SYNC_ENABLED === 'true';
}

export type FreshPaymentLink = { url: string; paymentLinkId: string; orderId: string | null };

// Mint a FRESH single-use Square payment link for one catalog variation, on
// demand (one per checkout click). API-generated payment links are single-use
// ONLY: a link is bound to its order and, after the first purchase, permanently
// shows that order's "payment confirmed" receipt to everyone. The API cannot
// create reusable links (only the Square Dashboard can). So instead of storing
// three static links per show, `/shows/[slug]/checkout` calls this per click
// and 302s the buyer to the fresh link — unlimited buyers, and the order keeps
// its catalog `catalog_object_id` so getShowPurchases still matches by variation.
// Returns undefined when Square sync is disabled (dev); throws on API error.
export async function createTierPaymentLink(
  variationId: string,
  quantity = 1,
): Promise<FreshPaymentLink | undefined> {
  if (!isSquareSyncEnabled()) return;
  const token = requireEnv('SQUARE_ACCESS_TOKEN');
  const locationId = requireEnv('SQUARE_LOCATION_ID');
  // Square's hosted checkout can't offer a quantity selector to the buyer, so the
  // count is baked into the order here (chosen on our /tickets page). Clamp to a
  // sane 1..10 — quantity doesn't affect getShowPurchases, which matches by variation.
  const qty = Math.min(Math.max(Math.trunc(quantity) || 1, 1), 10);
  const res = await squareFetch<PaymentLinkResponse>(
    '/v2/online-checkout/payment-links',
    {
      method: 'POST',
      body: JSON.stringify({
        // Unique per click → a distinct order, i.e. a genuinely fresh link each
        // time (a stable key would just return the same single-use link again).
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: locationId,
          line_items: [{ catalog_object_id: variationId, quantity: String(qty) }],
        },
      }),
    },
    token,
  );
  const link = res.payment_link;
  if (!link?.url) throw new Error('[square] on-demand payment-link create returned no url');
  return { url: link.url, paymentLinkId: link.id, orderId: link.order_id ?? null };
}

// Delete a payment link (also cancels its draft order). Used by the checkout
// canary so daily test links don't accumulate in Square. No-op when sync is
// disabled — there's nothing live to delete.
export async function deletePaymentLink(paymentLinkId: string): Promise<void> {
  if (!isSquareSyncEnabled()) return;
  const token = requireEnv('SQUARE_ACCESS_TOKEN');
  await squareFetch<Record<string, never>>(
    `/v2/online-checkout/payment-links/${encodeURIComponent(paymentLinkId)}`,
    { method: 'DELETE' },
    token,
  );
}

export type RetrievedOrderLine = {
  catalogObjectId: string | null;
  quantity: number;
  // The line's total in cents (Square's total_money — includes quantity).
  // null only if Square ever omits it; callers fall back to the payment total.
  totalCents: number | null;
};

// Retrieve one order's line items — the webhook uses this to map a payment back
// to a show via the line items' catalog variation ids. Read-only, so it doesn't
// check SQUARE_SYNC_ENABLED (same as getShowPurchases). Throws on API error so
// the webhook can 500 and let Square retry.
export async function retrieveOrderLines(orderId: string): Promise<RetrievedOrderLine[]> {
  const token = requireEnv('SQUARE_ACCESS_TOKEN');
  const data = await squareFetch<{
    order?: {
      line_items?: {
        catalog_object_id?: string;
        quantity?: string;
        total_money?: { amount?: number };
      }[];
    };
  }>(
    `/v2/orders/${encodeURIComponent(orderId)}`,
    { method: 'GET' },
    token,
  );
  return (data.order?.line_items ?? []).map((li) => ({
    catalogObjectId: li.catalog_object_id ?? null,
    // Square sends quantity as a string; clamp garbage to 1.
    quantity: Math.max(1, Math.trunc(Number(li.quantity)) || 1),
    totalCents: Number.isFinite(li.total_money?.amount) ? Number(li.total_money!.amount) : null,
  }));
}

export type ShowPurchase = {
  email: string | null;
  amountCents: number;
  quantity: number;
  variationId: string | null;
  orderId: string;
  purchasedAt: string;
};

// Read-only: who bought a donation for this show. Keyed off COMPLETED *payments*
// (order state stays OPEN for payment-link checkouts, so it can't be filtered
// on), then matched to the show via each order's line-item variation IDs. Never
// throws — returns [] on any failure so the RSVP page degrades gracefully.
export async function getShowPurchases(
  variationIds: string[],
  opts: { since?: Date; until?: Date } = {},
): Promise<ShowPurchase[]> {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId || variationIds.length === 0) return [];
  const wanted = new Set(variationIds);
  const authHeaders = { 'Square-Version': SQUARE_VERSION, Authorization: `Bearer ${token}` };

  try {
    // 1) COMPLETED payments in the window → { orderId, email, amountCents, createdAt }.
    const beginTime = (opts.since ?? new Date(Date.now() - 180 * 86_400_000)).toISOString();
    const payments: { orderId: string; email: string | null; amountCents: number; createdAt: string }[] = [];
    let cursor: string | undefined;
    do {
      const url = new URL(`${SQUARE_BASE}/v2/payments`);
      url.searchParams.set('location_id', locationId);
      url.searchParams.set('begin_time', beginTime);
      if (opts.until) url.searchParams.set('end_time', opts.until.toISOString());
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url, { headers: authHeaders });
      if (!res.ok) throw new Error(`list payments failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        payments?: { order_id?: string; status?: string; buyer_email_address?: string; amount_money?: { amount?: number }; created_at?: string }[];
        cursor?: string;
      };
      for (const p of data.payments ?? []) {
        if (p.status === 'COMPLETED' && p.order_id) {
          payments.push({
            orderId: p.order_id,
            email: p.buyer_email_address ?? null,
            amountCents: p.amount_money?.amount ?? 0,
            createdAt: p.created_at ?? '',
          });
        }
      }
      cursor = data.cursor;
    } while (cursor);
    if (payments.length === 0) return [];

    // 2) Retrieve those orders; note which ones contain one of this show's variations.
    const orderIds = [...new Set(payments.map((p) => p.orderId))];
    const matchedLineByOrder = new Map<string, { variationId: string; quantity: number }>();
    for (let i = 0; i < orderIds.length; i += 100) {
      const res = await fetch(`${SQUARE_BASE}/v2/orders/batch-retrieve`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: locationId, order_ids: orderIds.slice(i, i + 100) }),
      });
      if (!res.ok) throw new Error(`batch-retrieve orders failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        orders?: { id: string; line_items?: { catalog_object_id?: string; quantity?: string }[] }[];
      };
      for (const o of data.orders ?? []) {
        for (const li of o.line_items ?? []) {
          if (li.catalog_object_id && wanted.has(li.catalog_object_id)) {
            matchedLineByOrder.set(o.id, {
              variationId: li.catalog_object_id,
              // Square sends quantity as a string; clamp garbage to 1.
              quantity: Math.max(1, Math.trunc(Number(li.quantity)) || 1),
            });
            break;
          }
        }
      }
    }

    // 3) Emit the payments whose order matched this show.
    return payments
      .filter((p) => matchedLineByOrder.has(p.orderId))
      .map((p) => ({
        email: p.email,
        amountCents: p.amountCents,
        quantity: matchedLineByOrder.get(p.orderId)?.quantity ?? 1,
        variationId: matchedLineByOrder.get(p.orderId)?.variationId ?? null,
        orderId: p.orderId,
        purchasedAt: p.createdAt,
      }));
  } catch (err) {
    console.error('[square] getShowPurchases failed', err);
    return [];
  }
}

export type ShowPurchaseMatches = {
  // Keyed by the RSVP's lowercased email; only includes RSVPs with a matching
  // purchase (by their own email or their manually-linked buyer_email).
  purchasesByEmail: Record<string, { totalCents: number; count: number; quantity: number }>;
  // Buyers whose email didn't match any RSVP (typo or different address).
  unmatchedBuyers: { email: string; amountCents: number; quantity: number; purchasedAt: string }[];
  // Lowercased emails of RSVPs that have at least one matching purchase.
  paidEmails: Set<string>;
};

export type RsvpMatchInput = { email: string; buyerEmail?: string | null };

// Matches this show's Square donation purchases to a set of RSVP emails. Extracted
// from the RSVP admin page so the "email RSVPs who haven't bought" flow shares the
// exact same matching (variation IDs + a tight time window around the show date).
// Best-effort: returns empty matches if Square is off or the show was never synced.
export async function getShowPurchaseMatches(
  showId: number,
  rsvps: RsvpMatchInput[],
): Promise<ShowPurchaseMatches> {
  const empty: ShowPurchaseMatches = {
    purchasesByEmail: {},
    unmatchedBuyers: [],
    paidEmails: new Set<string>(),
  };

  const links = await sql<{ variationId: string | null; createdAt: string }[]>`
    select square_variation_id as "variationId", created_at as "createdAt"
    from show_square_links
    where show_id = ${showId}
  `;
  const variationIds = links.map((l) => l.variationId).filter((v): v is string => Boolean(v));
  if (variationIds.length === 0) return empty;

  const [show] = await sql<{ date: string }[]>`
    select date::text as date from shows where id = ${showId}
  `;
  if (!show) return empty;

  // Only scan payments from when the links were created through a few days after
  // the show — keeps the Square sweep tight.
  const earliest = links.reduce<string | null>(
    (min, l) => (l.createdAt && (!min || l.createdAt < min) ? l.createdAt : min),
    null,
  );
  const showMidnight = new Date(show.date + 'T00:00:00').getTime();
  const since = earliest ? new Date(earliest) : new Date(showMidnight - 120 * 86_400_000);
  const until = new Date(showMidnight + 3 * 86_400_000);

  const purchases = await getShowPurchases(variationIds, { since, until });

  // Map both the RSVP's own email and its manually-linked buyer_email to the
  // RSVP's canonical (lowercased) email, so purchases land under the RSVP either way.
  const canonicalByEmail = new Map<string, string>();
  for (const r of rsvps) {
    const canonical = r.email.trim().toLowerCase();
    if (!canonical) continue;
    canonicalByEmail.set(canonical, canonical);
    const alt = r.buyerEmail?.trim().toLowerCase();
    if (alt && !canonicalByEmail.has(alt)) canonicalByEmail.set(alt, canonical);
  }
  const purchasesByEmail: Record<string, { totalCents: number; count: number; quantity: number }> = {};
  const unmatchedBuyers: { email: string; amountCents: number; quantity: number; purchasedAt: string }[] = [];
  const paidEmails = new Set<string>();

  for (const p of purchases) {
    const canonical = canonicalByEmail.get(p.email?.toLowerCase() ?? '');
    if (canonical) {
      const cur = purchasesByEmail[canonical] ?? { totalCents: 0, count: 0, quantity: 0 };
      purchasesByEmail[canonical] = {
        totalCents: cur.totalCents + p.amountCents,
        count: cur.count + 1,
        quantity: cur.quantity + p.quantity,
      };
      paidEmails.add(canonical);
    } else {
      unmatchedBuyers.push({
        email: p.email ?? '(no email)',
        amountCents: p.amountCents,
        quantity: p.quantity,
        purchasedAt: p.purchasedAt,
      });
    }
  }

  return { purchasesByEmail, unmatchedBuyers, paidEmails };
}

// Attach a show's flyer to an already-created Square item, for the "created the
// links before a flyer existed" case. Idempotent per show (stable image key).
export async function attachShowFlyerToSquare(show: ShowInput, itemId: string): Promise<string> {
  if (!show.flyer) throw new Error(`[square] show ${show.id} has no flyer to attach`);
  const token = requireEnv('SQUARE_ACCESS_TOKEN');
  try {
    return await uploadFlyer(itemId, show.flyer, show.id, token);
  } catch (err) {
    console.error(`[square] flyer attach failed for show ${show.id}`, err);
    throw err;
  }
}
