import RehearsalRequests, { type RowView } from '@/components/admin/rehearsal/RehearsalRequests';
import {
  displayStatus,
  groupByRequest,
  isLivePending,
  outstandingBookings,
  pendingBookings,
  upcomingConfirmed,
  type AdminBooking,
} from '@/lib/rehearsal/decisions';
import { clashesFor } from '@/lib/rehearsal/availability-data';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { money, sessionLabel, shortDay } from '@/lib/rehearsal/format';

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
    when: sessionLabel(b.startsAt, b.endsAt),
    shortWhen: shortDay(b.startsAt),
    price: money(b.priceCents),
    priceCents: b.priceCents,
    status: displayStatus(b, now),
    live: isLivePending(b, now),
    paymentStatus: b.paymentStatus,
    paymentMethod: b.paymentMethod,
    gear: [b.gearNeeded.join(', '), b.gearNotes].filter(Boolean).join(' — '),
    note: b.note,
    clash: (reasons.get(b.id) ?? []).map((r) => REASON[r] ?? r),
    calendarUnchecked: b.calendarUnchecked,
    adminEmailed: Boolean(b.adminEmailedAt),
    bandEmailed: Boolean(b.bandEmailedAt),
    expires: shortDay(b.expiresAt),
    requested: shortDay(b.createdAt),
  });

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-10">
      {!settings.address && (
        <p className="rounded border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-200">
          No address in Rehearsal Settings yet — confirmations will go out without one.
        </p>
      )}
      <RehearsalRequests
        requests={groupByRequest(pending).map((g) => g.map(view))}
        outstanding={outstanding.map(view)}
        upcoming={upcoming.map(view)}
      />
    </main>
  );
}
