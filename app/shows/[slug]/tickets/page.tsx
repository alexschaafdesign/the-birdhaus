import { getShowBySlug } from '@/lib/shows';
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

export default async function TicketsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
  if (!show) notFound();

  const links = await sql<TierLink[]>`
    select tier_label as "tierLabel", amount_cents as "amountCents",
           square_variation_id as "variationId", url
    from show_square_links
    where show_id = ${show.id}
    order by amount_cents
  `;

  // A tier is buyable if we can start a checkout for it: a catalog variation to
  // mint a fresh on-demand link from (prod), or a stored link as a dev fallback.
  const tiers = links.filter((l) => l.variationId || l.url);

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
          className="text-[#E8E0D0]/70 hover:text-[#E8E0D0] mb-8 inline-block text-sm uppercase tracking-wide"
        >
          ← Back to show
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-2 leading-tight">{show.title}</h1>
        <p className="text-sm text-[#E8E0D0]/70 mb-8">{formattedDate}</p>

        <h2 className="text-xl font-bold mb-2">Choose your donation</h2>
        <p className="text-sm text-[#E8E0D0]/70 mb-6 max-w-prose">
          No ticket is required for entry — donations go straight to the artists and keeping the
          venue running. Pick whatever works for you.
        </p>

        {tiers.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">
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
                className="flex items-center justify-between gap-4 border-2 border-[#E8E0D0]/20 rounded-lg px-6 py-4 bg-[#E8E0D0]/5 hover:bg-[#E8E0D0]/10 transition-colors"
              >
                <input type="hidden" name="tier" value={tier.amountCents} />
                <span className="font-bold">{tierName(tier.tierLabel)}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-[#E8E0D0]/70">
                    <span className="uppercase tracking-wide">Qty</span>
                    <select
                      name="qty"
                      defaultValue="1"
                      aria-label={`Quantity for ${tierName(tier.tierLabel)}`}
                      className="rounded-md border-2 border-[#E8E0D0]/20 bg-[#1a1a1a] text-[#E8E0D0] px-2 py-1 font-bold"
                    >
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="text-lg font-bold whitespace-nowrap hover:text-white transition-colors"
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
