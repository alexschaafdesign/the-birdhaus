import { findShowSlugIgnoringCase, getShowById, getShowBySlug, getTicketAvailability, slugForShowParam } from '@/lib/shows';
import { sql } from '@/lib/db';
import { notFound, permanentRedirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { broadcastDate } from '@/lib/catalogue';
import { isStaging, outboundAllowed } from '@/lib/staging';
import { SiteFrame } from '@/components/night/SiteFrame';
import { Panel, StatusNotice } from '@/components/night/NightParts';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ButtonArrow, buttonClassName } from '@/components/ui/Button';
import { FORM } from '@/components/night/form';

// Donation-tier picker (2027 frame). Ticket URL points here; each button opens
// that tier's Square checkout. Kept dynamic so it always reflects the current
// Square links. States, top to bottom: cancelled / postponed (StatusNotice in
// place of everything), checkout disabled (off production), checkout error,
// only-N-left, sold out, no tiers yet, the tiers.
export const dynamic = 'force-dynamic';

// One row per donation tier. A tier is buyable when it has a catalog variation
// (used to mint a fresh on-demand Square link) or, in dev, a stored link.
type TierLink = {
  tierLabel: string;
  amountCents: number;
  variationId: string | null;
  url: string | null;
};

function tierName(label: string): string {
  // "Reduced donation ($10)" -> "Reduced donation"; the amount is shown separately.
  return label.replace(/\s*\(\$\d+(?:\.\d{2})?\)\s*$/, '').trim() || label;
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const slug = await slugForShowParam((await params).id);
  const show = await getShowBySlug(slug);
  if (!show) return {};
  return { title: `Donate — ${show.title}`, robots: { index: false } };
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout_error?: string; sold_out?: string; left?: string; checkout?: string }>;
}) {
  // The segment is a catalogue id or an old slug (Phase 3 turns slugs into
  // 308s to the id); the ticket code below still keys on the slug.
  const slug = await slugForShowParam((await params).id);
  const show = await getShowBySlug(slug);
  if (!show) {
    // A case-only mismatch (old capitalised link) → 308 to the stored slug,
    // keeping the query (checkout_error / sold_out / left banners).
    const canonical = await findShowSlugIgnoringCase(slug);
    if (canonical && canonical !== slug) {
      const qs = new URLSearchParams(
        Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === 'string')
      ).toString();
      permanentRedirect(`/shows/${encodeURIComponent(canonical)}/tickets${qs ? `?${qs}` : ''}`);
    }
    notFound();
  }

  // The page header, the same in every state: back to the night, then the
  // night's title and date.
  const head = (
    <section className="flex flex-col gap-3">
      <Link
        href={`/shows/${show.catalogueId}`}
        className={`${FORM.link} text-ui-nav-item-14 w-fit tracking-[--spacing(0.25)] uppercase`}
      >
        ← {show.catalogueId}
      </Link>
      <p className="text-data-overline-11 text-accent-red font-bold tracking-[--spacing(0.625)] uppercase">
        Tickets
      </p>
      <h1 className="text-header-2 max-w-3xl leading-[1.1] font-bold break-words uppercase">{show.title}</h1>
      <p className="text-data-spec-12 uppercase">{broadcastDate(show.date)}</p>
    </section>
  );

  // Cancelled or postponed: no buy buttons — the show page's notice instead,
  // with the new date's tickets for a postponed show. Returns before any of the
  // ticket logic below runs (the /checkout route refuses these shows too).
  if (show.status !== 'scheduled') {
    const next = show.status === 'postponed' && show.rescheduledTo ? await getShowById(show.rescheduledTo) : null;
    const nextPublic = next && next.announced ? next : null;
    return (
      <SiteFrame stats={null} navPath="/shows">
        {head}
        <StatusNotice
          status={show.status}
          newDate={
            nextPublic ? { id: nextPublic.catalogueId, date: nextPublic.date, tickets: Boolean(nextPublic.ticketUrl) } : null
          }
          ticketsClosed
        />
      </SiteFrame>
    );
  }

  // Set when /checkout couldn't mint a Square link and bounced the buyer back
  // here (the tier forms open in a new tab, so the banner lands in that tab).
  // `left` is set when /checkout turned a buyer away because they asked for more
  // than remain; the sold-out state itself is derived from live availability below.
  // `checkout=disabled` is where /checkout sends everyone off production
  // (lib/staging.ts); ignored on production, where checkout runs.
  const { checkout_error: checkoutError, left: leftParam, checkout } = await searchParams;
  const host = (await headers()).get('host');
  const checkoutDisabled = checkout === 'disabled' && !outboundAllowed(host);

  // Online ticket cap (null when the show is uncapped).
  const availability = await getTicketAvailability(show.id, show.ticketLimit ?? null);
  const capped = availability.limit !== null;
  const remaining = availability.remaining;

  const links = await sql<TierLink[]>`
    select tier_label as "tierLabel", amount_cents as "amountCents",
           square_variation_id as "variationId", url
    from show_square_links
    where show_id = ${show.id}
    order by amount_cents
  `;

  // A tier is buyable if we can start a checkout for it: a catalog variation to
  // mint a fresh on-demand link from (prod), or a stored link as a dev fallback.
  // When a cap is set and reached, nothing is buyable.
  const soldOut = availability.soldOut;
  const tiers = soldOut ? [] : links.filter((l) => l.variationId || l.url);

  // Cap the qty selector to what's left (never above 10, always at least 1).
  const maxQty = capped && remaining !== null ? Math.min(10, Math.max(1, remaining)) : 10;

  return (
    <SiteFrame stats={null} navPath="/shows">
      {head}

      {checkoutDisabled && (
        <div role="status" className={`${FORM.notice} flex max-w-2xl flex-col gap-1`}>
          <p className="font-bold uppercase">Checkout disabled on {isStaging(host) ? 'staging' : 'this deploy'}</p>
          <p>Ticket sales only run on thebirdhaus.org. Nothing was charged and Square wasn&apos;t contacted.</p>
        </div>
      )}

      {checkoutError && (
        <div role="alert" className={`${FORM.error} flex max-w-2xl flex-col gap-1`}>
          <p className="font-bold">Sorry — we couldn&apos;t start checkout just now.</p>
          <p>
            It&apos;s not you. Please try again in a minute, or just pay at the door — cash, Venmo, and card all
            work. We&apos;ve been notified and are on it.
          </p>
        </div>
      )}

      {leftParam !== undefined && !soldOut && (
        <div role="alert" className={`${FORM.error} flex max-w-2xl flex-col gap-1`}>
          <p className="font-bold">Almost sold out.</p>
          <p>
            Only {leftParam} ticket{leftParam === '1' ? '' : 's'} left online — please lower the quantity to{' '}
            {leftParam} or fewer. There&apos;s always room to pay at the door too.
          </p>
        </div>
      )}

      {soldOut ? (
        <Panel label="Sold out">
          <p className="text-body-3 max-w-2xl leading-normal">
            Online tickets are sold out. You can still pay what you can at the door — cash, Venmo, and card all
            work. Come early; entry is first come, first served.
          </p>
        </Panel>
      ) : (
        <section className="flex max-w-2xl flex-col gap-4">
          <SectionHeader label="Choose your donation" rule="none" />
          <p className="text-body-3 leading-normal">
            No ticket is required for entry — donations go straight to the artists and keeping the venue running.
            Pick whatever works for you.
          </p>
          {capped && remaining !== null && (
            <p className="text-body-3 text-accent-red font-bold">
              {remaining} ticket{remaining === 1 ? '' : 's'} left online.
            </p>
          )}
          {tiers.length === 0 ? (
            <p className="text-body-3 leading-normal">
              Donation links aren&apos;t available for this show yet — check back soon.
            </p>
          ) : (
            <ul className="border-surface-ink/20 flex flex-col border-t">
              {tiers.map((tier) => (
                <li key={tier.amountCents} className="border-surface-ink/20 border-b">
                  {/* A GET <form> (not next/link) so the route handler isn't
                      prefetched — each submit mints a fresh Square link, so we
                      only want it on click. The quantity <select> lets buyers
                      cover their whole party in one checkout (Square's own page
                      has no quantity field, so we set it here). */}
                  <form
                    action={`/shows/${show.slug}/checkout`}
                    method="GET"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4"
                  >
                    <input type="hidden" name="tier" value={tier.amountCents} />
                    <span className="text-ui-nav-item-14 min-w-0 leading-[1.3] font-bold tracking-[--spacing(0.25)] uppercase">
                      {tierName(tier.tierLabel)}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2">
                        <span className="text-data-overline-11 font-bold tracking-[--spacing(0.625)] uppercase">Qty</span>
                        <select
                          name="qty"
                          defaultValue="1"
                          aria-label={`Quantity for ${tierName(tier.tierLabel)}`}
                          className={`${FORM.field} w-auto py-1.5 font-bold`}
                        >
                          {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className={`${buttonClassName('primary', 's')} cursor-pointer`}>
                        {dollars(tier.amountCents)}
                        <ButtonArrow size="s" />
                      </button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </SiteFrame>
  );
}
