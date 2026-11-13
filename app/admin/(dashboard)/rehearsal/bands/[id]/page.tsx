import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookingUrl, getBand } from '@/lib/rehearsal/bands';
import { bandHistory, bandTotals, displayStatus } from '@/lib/rehearsal/decisions';
import { money, sessionLabel } from '@/lib/rehearsal/format';
import RehearsalBandEditor from '@/components/admin/rehearsal/RehearsalBandEditor';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'text-emerald-300',
  pending: 'text-amber-200',
};

export default async function RehearsalBandPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const band = await getBand(id);
  if (!band) notFound();
  const [history, totals] = await Promise.all([bandHistory(id), bandTotals(id)]);
  const now = new Date();

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-10">
      <p className="text-sm">
        <Link href="/admin/rehearsal/bands" className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline">
          ← All rehearsal bands
        </Link>
      </p>

      <section className="grid gap-4 sm:grid-cols-4">
        {[
          ['Sessions played', String(totals.sessions)],
          ['Coming up', String(totals.upcoming)],
          ['Paid', money(totals.paidCents)],
          ['Outstanding', money(totals.outstandingCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-[#E8E0D0]/15 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/50">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <RehearsalBandEditor
        band={{
          id: band.id,
          name: band.name,
          contactName: band.contactName,
          email: band.email,
          phone: band.phone,
          notes: band.notes,
          archived: band.archived,
          url: band.token ? bookingUrl(band.token) : null,
          gear: [band.defaultGearNeeded.join(', '), band.defaultGearNotes].filter(Boolean).join(' — '),
        }}
      />

      <section className="space-y-3">
        <h2 className="text-xl font-bold">History</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[#E8E0D0]/50">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-[#E8E0D0]/10 rounded-lg border border-[#E8E0D0]/15 text-sm">
            {history.map((b) => {
              const status = displayStatus(b, now);
              return (
                <li key={b.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2">
                  <span className="w-24 text-[#E8E0D0]/50">{b.catalogueId}</span>
                  <span className="min-w-56 font-medium">{sessionLabel(b.startsAt, b.endsAt)}</span>
                  <span className={`w-20 uppercase text-xs tracking-wide ${STATUS_STYLE[status] ?? 'text-[#E8E0D0]/50'}`}>{status}</span>
                  <span>{money(b.priceCents)}</span>
                  {status === 'confirmed' && (
                    <span className="text-[#E8E0D0]/60">
                      {b.paymentStatus}
                      {b.paymentProvider ? ` (${b.paymentProvider})` : ''}
                    </span>
                  )}
                  {b.declineReason && <span className="text-[#E8E0D0]/50">“{b.declineReason}”</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
