import type { Metadata } from 'next';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import BookingView, { type BookingViewProps } from '@/components/rehearsal/BookingView';
import { getBandByToken } from '@/lib/rehearsal/bands';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { loadAvailability } from '@/lib/rehearsal/availability-data';
import { addDays, chicagoDate, forBand, weekdayOf } from '@/lib/rehearsal/availability';
import { canBandChange, listBandBookings } from '@/lib/rehearsal/requests';
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
  const sunday = addDays(today, -weekdayOf(today)); // calendar weeks run Sunday–Saturday
  const bookings = await listBandBookings(band.id);
  // Change requests still waiting, keyed by the confirmed booking they'd
  // replace. They show under that booking (with Withdraw), not as rows.
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const waitingFor = new Map(
    bookings
      .filter(
        (b) =>
          b.status === 'pending' &&
          b.expiresAt > now &&
          b.replacesBookingId !== null &&
          byId.get(b.replacesBookingId)?.status === 'confirmed',
      )
      .map((b) => [b.replacesBookingId!, b]),
  );
  const waitingIds = new Set([...waitingFor.values()].map((b) => b.id));
  // Not worth a row: a withdrawn or superseded change, and an original that
  // a change replaced (moved, or a request swapped for a new one).
  const hidden = new Set(
    bookings
      .filter(
        (b) =>
          b.status === 'cancelled' &&
          (b.replacesBookingId !== null ||
            bookings.some((x) => x.replacesBookingId === b.id && (x.status === 'confirmed' || x.status === 'pending'))),
      )
      .map((b) => b.id),
  );
  const changeable = bookings.filter((b) => canBandChange(b, now) && !waitingFor.has(b.id) && !waitingIds.has(b.id));
  const [settings, { availability, freeIgnoring }, series] = await Promise.all([
    getRehearsalSettings(),
    loadAvailability({ viewerBandId: band.id, fromDate: sunday, now, freeIgnoring: changeable.map((b) => b.id) }),
    listBandSeries(band.id, now),
  ]);
  const view = forBand(availability);
  const minFree = Math.min(...settings.allowedLengths) * 60_000;
  const spans = (list: Array<{ start: Date; end: Date }>) =>
    list.filter((f) => f.end.getTime() - f.start.getTime() >= minFree).map((f) => ({ start: f.start.toISOString(), end: f.end.toISOString() }));

  // The door code only while they have a confirmed session that hasn't ended.
  const hasLiveSession = bookings.some((b) => b.status === 'confirmed' && b.endsAt > now);

  const props: BookingViewProps = {
    token,
    bandName: band.name,
    doorCode: band.doorCode && hasLiveSession ? band.doorCode : null,
    address: settings.address.trim() && hasLiveSession ? settings.address.trim() : null,
    contactEmail: CONTACT_EMAIL,
    today,
    days: view.days.map((d) => ({
      date: d.date,
      window: d.window ? { start: d.window.start.toISOString(), end: d.window.end.toISOString() } : null,
      // Slivers too short for the shortest length aren't worth showing.
      free: spans(d.free),
      own: d.own.map((o) => ({ bookingId: o.bookingId, start: o.start.toISOString(), end: o.end.toISOString(), state: o.state })),
    })),
    startStepMinutes: settings.startStepMinutes,
    allowedLengths: settings.allowedLengths,
    bufferMinutes: settings.bufferMinutes,
    rates:
      settings.estimatesEnabled && !settings.paymentsEnabled
        ? { rateHourlyCents: settings.rateHourlyCents, ratePackages: settings.ratePackages }
        : null,
    bookings: bookings
      .filter((b) => !waitingIds.has(b.id) && !hidden.has(b.id))
      .map((b) => {
        const waiting = waitingFor.get(b.id);
        const free = freeIgnoring.get(b.id);
        return {
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
      // Its day's open time if it moved (its own time counts as free); null = can't change.
      changeFree: changeable.some((c) => c.id === b.id) ? spans(free ?? []) : null,
      pendingChange: waiting
        ? { id: waiting.id, start: waiting.startsAt.toISOString(), end: waiting.endsAt.toISOString(), note: waiting.note }
        : null,
        };
      }),
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
      <BookingView {...props} />
    </SiteFrame>
  );
}
