import RehearsalRequests, { type RowView } from '@/components/admin/rehearsal/RehearsalRequests';
import RunDailyButton from '@/components/admin/rehearsal/RunDailyButton';
import {
  displayStatus,
  groupByRequest,
  isLivePending,
  outstandingBookings,
  pendingBookings,
  repeatLabel,
  upcomingConfirmed,
  type AdminBooking,
} from '@/lib/rehearsal/decisions';
import { clashesFor } from '@/lib/rehearsal/availability-data';
import { lengthLabel, usualRateFor } from '@/lib/rehearsal/estimate';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { money, sessionLabel, shortDay } from '@/lib/rehearsal/format';
import { PageHeader, StatusMark } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

export const dynamic = 'force-dynamic';

const REASON: Record<string, string> = {
  show: 'show that day',
  unavailable_day: 'Not available day',
  blackout: 'blackout',
  busy: 'calendar busy',
};

export default async function RehearsalRequestsPage() {
  const now = new Date();
  const [pending, outstanding, upcoming, settings] = await Promise.all([
    pendingBookings(),
    outstandingBookings(),
    upcomingConfirmed(),
    getRehearsalSettings(),
  ]);
  const { reasons } = await clashesFor([...pending.filter((b) => isLivePending(b, now)), ...upcoming], now);

  const view = (b: AdminBooking): RowView => ({
    id: b.id,
    catalogueId: b.catalogueId,
    bandId: b.bandId,
    bandName: b.bandName,
    rateNotes: b.rateNotes,
    usualRate: usualRateFor(b.startsAt, b.endsAt, b.seriesFreq, settings),
    when: `${sessionLabel(b.startsAt, b.endsAt)} (${lengthLabel(b.startsAt, b.endsAt)})`,
    shortWhen: shortDay(b.startsAt),
    price: money(b.priceCents),
    priceCents: b.priceCents,
    status: displayStatus(b, now),
    live: isLivePending(b, now),
    paymentStatus: b.paymentStatus,
    paymentMethod: b.paymentMethod,
    paymentProvider: b.paymentProvider,
    gear: [b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — '),
    note: b.note,
    clash: (reasons.get(b.id) ?? []).map((r) => REASON[r] ?? r),
    calendarUnchecked: b.calendarUnchecked,
    adminEmailed: Boolean(b.adminEmailedAt),
    bandEmailed: Boolean(b.bandEmailedAt),
    expires: shortDay(b.expiresAt),
    requested: shortDay(b.createdAt),
    repeat: repeatLabel(b),
    changeFrom:
      b.replacesStartsAt && b.replacesEndsAt
        ? `${sessionLabel(b.replacesStartsAt, b.replacesEndsAt)} · ${b.replacesCatalogueId}${
            b.replacesStatus === 'confirmed' ? ', confirmed until you approve' : ''
          }`
        : null,
  });

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 pt-8 pb-16 sm:px-8">
      <div className="space-y-4">
        <PageHeader overline="Rehearsal" title="Requests" />
        <RunDailyButton />
        {!settings.address && (
          <p className={`${FORM.notice} flex flex-wrap items-baseline gap-2`}>
            <StatusMark tone="attention">No address</StatusMark>
            No address in Rehearsal Settings yet — confirmations will go out without one.
          </p>
        )}
      </div>
      <RehearsalRequests
        requests={groupByRequest(pending).map((g) => g.map(view))}
        outstanding={outstanding.map(view)}
        upcoming={upcoming.map(view)}
        paymentsEnabled={settings.paymentsEnabled}
      />
    </main>
  );
}
