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
import { ADMIN_TYPE, PageHeader, StatusMark, type StatusTone } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, StatusTone> = {
  confirmed: 'ok',
  pending: 'attention',
  declined: 'problem',
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
    <main className="mx-auto max-w-6xl space-y-10 px-4 pt-8 pb-16 sm:px-8">
      <div>
        <p className="text-body-3 mb-4">
          <Link href="/admin/rehearsal/bands" className={ADMIN_TYPE.link}>
            ← All rehearsal bands
          </Link>
        </p>
        <PageHeader overline="Rehearsal · Band" title={band.name} />
      </div>

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
          <div key={label} className="border border-surface-ink px-4 py-3">
            <p className={`${ADMIN_TYPE.overline} text-surface-ink/60`}>{label}</p>
            <p className="text-header-3 font-bold tabular-nums">{value}</p>
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
          <h2 className={ADMIN_TYPE.heading}>Repeating bookings</h2>
          <div className="border border-surface-ink">
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
        <h2 className={ADMIN_TYPE.heading}>History</h2>
        {history.length === 0 ? (
          <p className="text-body-3 text-surface-ink/60">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-surface-ink/20 border border-surface-ink text-body-3">
            {history.map((b) => {
              const status = displayStatus(b, now);
              return (
                <li key={b.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2">
                  <span className="w-24 text-surface-ink/60">{b.catalogueId}</span>
                  <span className="min-w-56 font-bold">{sessionLabel(b.startsAt, b.endsAt)}</span>
                  <span className="w-24">
                    <StatusMark tone={STATUS_TONE[status] ?? 'neutral'}>{status}</StatusMark>
                  </span>
                  {settings.paymentsEnabled && <span>{money(b.priceCents)}</span>}
                  {settings.paymentsEnabled && status === 'confirmed' && b.paymentProvider && b.paymentStatus === 'paid' && (
                    <span className="text-surface-ink/60">via {b.paymentProvider}</span>
                  )}
                  {repeatLabel(b) && <span className="text-data-caption-13 text-surface-ink/70">↻ {repeatLabel(b)}</span>}
                  {b.declineReason && <span className="text-surface-ink/60">“{b.declineReason}”</span>}
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
