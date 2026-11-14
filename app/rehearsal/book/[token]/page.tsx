import type { Metadata } from 'next';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import BookingView, { type BookingViewProps } from '@/components/rehearsal/BookingView';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { addDays, chicagoDate, forBand, weekdayOf } from '@/lib/rehearsal/availability';
import { listBandBookings } from '@/lib/rehearsal/requests';
import { canBandCancel, paymentMethodsOffered } from '@/lib/rehearsal/request-rules';
import { listBandSeries } from '@/lib/rehearsal/series-extend';
import { describeEnd, describeRule } from '@/lib/rehearsal/series';

export const dynamic = 'force-dynamic';

// A band's private booking page. The link is the access (no login), so keep
// it out of indexes and never send it on as a Referer.
export const metadata: Metadata = {
  title: 'Book the rehearsal space',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const CONTACT_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'alex@thebirdhaus.org';

export default async function RehearsalBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const band = await getBandByToken(token);

  if (!band) {
    return (
      <SiteFrame stats={null}>
        <section aria-labelledby="inactive" className="text-body-3 flex max-w-xl flex-col gap-3 leading-normal">
          <SectionHeader id="inactive" label="Rehearsal booking" />
          <p>This booking link isn&apos;t active any more.</p>
          <p>
            If you&apos;re a band that rehearses here, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-accent-red underline underline-offset-4">
              {CONTACT_EMAIL}
            </a>{' '}
            for a fresh link.
          </p>
        </section>
      </SiteFrame>
    );
  }

  const now = new Date();
  const today = chicagoDate(now);
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7)); // weeks run Monday–Sunday
  const [settings, { availability }, bookings, series] = await Promise.all([
    getRehearsalSettings(),
    loadAvailability({ viewerBandId: band.id, fromDate: monday, now }),
    listBandBookings(band.id),
    listBandSeries(band.id, now),
  ]);
  const view = forBand(availability);

  const props: BookingViewProps = {
    token,
    bandName: band.name,
    contactEmail: CONTACT_EMAIL,
    firstMonday: monday,
    today,
    days: view.days.map((d) => ({
      date: d.date,
      window: d.window ? { start: d.window.start.toISOString(), end: d.window.end.toISOString() } : null,
      // Slivers too short for the shortest length aren't worth showing.
      free: d.free
        .filter((f) => f.end.getTime() - f.start.getTime() >= Math.min(...settings.allowedLengths) * 60_000)
        .map((f) => ({ start: f.start.toISOString(), end: f.end.toISOString() })),
      own: d.own.map((o) => ({ bookingId: o.bookingId, start: o.start.toISOString(), end: o.end.toISOString(), state: o.state })),
    })),
    startStepMinutes: settings.startStepMinutes,
    allowedLengths: settings.allowedLengths,
    bufferMinutes: settings.bufferMinutes,
    rates:
      settings.estimatesEnabled && !settings.paymentsEnabled
        ? { rateHourlyCents: settings.rateHourlyCents, ratePackages: settings.ratePackages }
        : null,
    bookings: bookings.map((b) => ({
      id: b.id,
      catalogueId: b.catalogueId,
      start: b.startsAt.toISOString(),
      end: b.endsAt.toISOString(),
      status: b.status,
      priceCents: b.priceCents,
      gearNeeded: b.gearNeeded,
      gearNotes: b.gearNotes,
      note: b.note,
      declineReason: b.declineReason,
      repeatLabel: b.repeatLabel,
      expiresAt: b.expiresAt.toISOString(),
      canCancel: canBandCancel(b, now, settings.cancelCutoffHours),
    })),
    paymentsEnabled: settings.paymentsEnabled,
    priceCents: settings.priceCents,
    repeatPriceCents: settings.repeatPriceCents ?? settings.priceCents,
    windowEnd: view.windowEnd.toISOString(),
    cancelCutoffHours: settings.cancelCutoffHours,
    pendingExpiryDays: settings.pendingExpiryDays,
    gearOptions: settings.gearOptions,
    paymentMethods: paymentMethodsOffered(settings),
    defaultGearNeeded: band.defaultGearNeeded.filter((g) => settings.gearOptions.includes(g)),
    defaultGearNotes: band.defaultGearNotes,
    series: series.map((s) => ({
      id: s.id,
      label: `${describeRule(chicagoDate(s.anchor), s.freq)} · ${describeEnd(s.rule)}`,
      status: s.status,
      endsOn: s.endsOn,
      upcoming: s.upcoming.map((d) => d.toISOString()),
    })),
  };

  return (
    <SiteFrame stats={null}>
      <h1 className="sr-only">Book the rehearsal space — {band.name}</h1>
      <BookingView {...props} />
    </SiteFrame>
  );
}
