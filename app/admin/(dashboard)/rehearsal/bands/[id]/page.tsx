import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bookingUrl, getBand } from '@/lib/rehearsal/bands';
import { bandHistory, bandTotals, displayStatus, repeatLabel } from '@/lib/rehearsal/decisions';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import GearEdit from '@/components/admin/rehearsal/GearEdit';
import SeriesList from '@/components/rehearsal/SeriesList';
import { listBandSeries } from '@/lib/rehearsal/series-extend';
import { describeEnd, describeRule } from '@/lib/rehearsal/series';
import { chicagoDate } from '@/lib/rehearsal/availability';
import { money, sessionLabel } from '@/lib/rehearsal/format';
import RehearsalBandEditor from '@/components/admin/rehearsal/RehearsalBandEditor';
import PaymentButtons from '@/components/rehearsal/PaymentButtons';

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
  const [history, totals, settings, series] = await Promise.all([
    bandHistory(id),
    bandTotals(id),
    getRehearsalSettings(),
    listBandSeries(id),
  ]);
  const now = new Date();

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-10">
      <p className="text-sm">
        <Link href="/admin/rehearsal/bands" className="text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline">
          ← All rehearsal bands
        </Link>
      </p>

      <section className={`grid gap-4 ${settings.paymentsEnabled ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
        {[
          ['Sessions played', String(totals.sessions)],
          ['Coming up', String(totals.upcoming)],
          ...(settings.paymentsEnabled
            ? [
                ['Paid', money(totals.paidCents)],
                ['Outstanding', money(totals.outstandingCents)],
              ]
            : []),
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
          rateNotes: band.rateNotes,
          archived: band.archived,
          url: band.token ? bookingUrl(band.token) : null,
          gear: [band.defaultGearNeeded.join(', '), band.defaultGearNotes].filter(Boolean).join(' — '),
        }}
      />

      {series.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Repeating bookings</h2>
          <div className="rounded-lg border border-[#E8E0D0]/15">
            <SeriesList
              series={series.map((s) => ({
                id: s.id,
                label: `${describeRule(chicagoDate(s.anchor), s.freq)} · ${describeEnd(s.rule)}`,
                status: s.status,
                endsOn: s.endsOn,
                upcoming: s.upcoming.map((d) => d.toISOString()),
              }))}
              endpoint="/api/admin/rehearsal/series/{id}/end"
              cutoffHours={null}
              look="admin"
            />
          </div>
        </section>
      )}

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
                  {settings.paymentsEnabled && <span>{money(b.priceCents)}</span>}
                  {settings.paymentsEnabled && status === 'confirmed' && b.paymentProvider && b.paymentStatus === 'paid' && (
                    <span className="text-[#E8E0D0]/60">via {b.paymentProvider}</span>
                  )}
                  {repeatLabel(b) && <span className="text-xs text-sky-200/80">↻ {repeatLabel(b)}</span>}
                  {b.declineReason && <span className="text-[#E8E0D0]/50">“{b.declineReason}”</span>}
                  {(status === 'confirmed' || status === 'pending') && (
                    <GearEdit id={b.id} options={settings.gearOptions} gearNeeded={b.gearNeeded} gearNotes={b.gearNotes} />
                  )}
                  {settings.paymentsEnabled && status === 'confirmed' && (
                    <span className="ml-auto">
                      <PaymentButtons id={b.id} status={b.paymentStatus} method={b.paymentMethod} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
