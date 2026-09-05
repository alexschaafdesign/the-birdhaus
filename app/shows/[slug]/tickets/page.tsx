import { getShowBySlug, getTicketAvailability } from '@/lib/shows';
import { sql } from '@/lib/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

// Donation-tier picker. Ticket URL points here; each button opens that tier's
// Square checkout. Kept dynamic so it always reflects the current Square links.
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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
  if (!show) return {};
  return { title: `Donate — ${show.title}`, robots: { index: false } };
}

export default async function TicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout_error?: string; sold_out?: string; left?: string }>;
}) {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
  if (!show) notFound();

  // Set when /checkout couldn't mint a Square link and bounced the buyer back
  // here (the tier forms open in a new tab, so the banner lands in that tab).
  // `left` is set when /checkout turned a buyer away because they asked for more
  // than remain; the sold-out state itself is derived from live availability below.
  const { checkout_error: checkoutError, left: leftParam } = await searchParams;

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

  const formattedDate = new Date(show.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link
          href={`/shows/${show.slug}`}
          className="text-ink/70 hover:text-vhs-red mb-8 inline-block font-mono text-sm uppercase tracking-wide"
        >
          ← Back to show
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-2 leading-tight">{show.title}</h1>
        <p className="font-mono text-sm text-ink/70 mb-8">{formattedDate}</p>

        {checkoutError ? (
          <div
            role="alert"
            className="mb-6 border-2 border-vhs-red bg-paper px-5 py-4 text-sm"
          >
            <p className="font-bold mb-1 text-vhs-red">Sorry — we couldn&apos;t start checkout just now.</p>
            <p className="text-ink/80">
              It&apos;s not you. Please try again in a minute, or just pay at the door — cash,
              Venmo, and card all work. We&apos;ve been notified and are on it.
            </p>
          </div>
        ) : null}

        {leftParam !== undefined && !soldOut ? (
          <div
            role="alert"
            className="mb-6 border-2 border-amber-600/50 bg-amber-500/10 px-5 py-4 text-sm"
          >
            <p className="font-bold mb-1">Almost sold out.</p>
            <p className="text-ink/80">
              Only {leftParam} ticket{leftParam === '1' ? '' : 's'} left online — please lower the
              quantity to {leftParam} or fewer. There&apos;s always room to pay at the door too.
            </p>
          </div>
        ) : null}

        <h2 className="text-lg font-bold mb-2">Choose your donation</h2>
        <p className="text-sm text-ink/70 mb-6 max-w-prose">
          No ticket is required for entry — donations go straight to the artists and keeping the
          venue running. Pick whatever works for you.
        </p>

        {capped && !soldOut && remaining !== null ? (
          <p className="text-sm font-bold text-amber-700 mb-6">
            {remaining} ticket{remaining === 1 ? '' : 's'} left online.
          </p>
        ) : null}

        {soldOut ? (
          <div className="border-2 border-ink bg-paper-deep px-6 py-8 text-center shadow-hard">
            <p className="text-lg font-bold mb-1">Online tickets are sold out.</p>
            <p className="text-sm text-ink/70 max-w-prose mx-auto">
              You can still pay what you can at the door — cash, Venmo, and card all work. Come early;
              entry is first come, first served.
            </p>
          </div>
        ) : tiers.length === 0 ? (
          <p className="text-sm text-ink/50">
            Donation links aren&apos;t available for this show yet — check back soon.
          </p>
        ) : (
          <div className="space-y-3">
            {tiers.map((tier) => (
              // A GET <form> (not next/link) so the route handler isn't prefetched —
              // each submit mints a fresh Square link, so we only want it on click.
              // The quantity <select> lets buyers cover their whole party in one
              // checkout (Square's own page has no quantity field, so we set it here).
              <form
                key={tier.amountCents}
                action={`/shows/${show.slug}/checkout`}
                method="GET"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-4 border-2 border-ink bg-paper-deep px-6 py-4 hover:bg-ink/10 transition-colors"
              >
                <input type="hidden" name="tier" value={tier.amountCents} />
                <span className="font-bold">{tierName(tier.tierLabel)}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-ink/70">
                    <span className="font-mono uppercase tracking-wide">Qty</span>
                    <select
                      name="qty"
                      defaultValue="1"
                      aria-label={`Quantity for ${tierName(tier.tierLabel)}`}
                      className="border-2 border-ink/40 bg-paper px-2 py-1 font-bold focus:outline-none focus:border-ink"
                    >
                      {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="font-mono text-base font-bold whitespace-nowrap hover:text-vhs-red transition-colors"
                  >
                    {dollars(tier.amountCents)} →
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
