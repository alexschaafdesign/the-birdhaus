import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFrame } from '@/components/night/SiteFrame';
import { SectionHeader } from '@/components/ui/SectionHeader';
import ReviewActions from '@/components/rehearsal/ReviewActions';
import PaymentButtons from '@/components/rehearsal/PaymentButtons';
import { isAdminSession } from '@/lib/admin-session';
import { linkSecret, verifyLink } from '@/lib/rehearsal/signed-links';
import { bookingsByIds, bookingsByRequest, displayStatus, isLivePending, repeatLabel } from '@/lib/rehearsal/decisions';
import { clashesFor } from '@/lib/rehearsal/availability-data';
import { getRehearsalSettings } from '@/lib/rehearsal/settings';
import { money, sessionLabel } from '@/lib/rehearsal/format';

export const dynamic = 'force-dynamic';

// Where Alex's Approve / Decline email links land. Opening it changes
// nothing: it shows the request and one button that POSTs (decision 2).
export const metadata: Metadata = {
  title: 'Rehearsal request',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const REASON: Record<string, string> = {
  show: 'a show is on that day',
  unavailable_day: 'the day is marked Not available',
  blackout: 'a blackout covers it',
  busy: 'your calendar is busy then',
};

const STATUS: Record<string, string> = {
  pending: 'Waiting for you',
  confirmed: 'Approved ✓',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = verifyLink(token, linkSecret());

  if (!v.ok) {
    return (
      <SiteFrame stats={null}>
        <section aria-labelledby="r" className="text-body-3 flex max-w-xl flex-col gap-3 leading-normal">
          <SectionHeader id="r" label="Rehearsal request" />
          <p>{v.reason === 'expired' ? 'This link has expired (they last 7 days).' : 'This link isn’t valid.'}</p>
          <p>
            <Link href="/admin/rehearsal/requests" className="hover:text-accent-red underline underline-offset-4">
              Open Requests in admin
            </Link>
          </p>
        </section>
      </SiteFrame>
    );
  }

  const p = v.payload;
  const list = p.k ? await bookingsByRequest(p.k) : await bookingsByIds([p.b!]);
  const [settings, { reasons, calendarChecked }, isAdmin] = await Promise.all([
    getRehearsalSettings(),
    clashesFor(list.filter((b) => isLivePending(b))),
    isAdminSession(),
  ]);
  const actionable = list.filter((b) => (p.a === 'approve' ? isLivePending(b) : b.status === 'pending'));
  const band = list[0];
  const gear = band ? [band.gearNeeded.join(', '), band.gearNotes].filter(Boolean).join(' — ') : '';

  return (
    <SiteFrame stats={null}>
      <section aria-labelledby="r" className="text-body-3 flex w-full max-w-2xl flex-col gap-5 leading-normal">
        <SectionHeader id="r" label={`${p.a === 'approve' ? 'Approve' : 'Decline'} · ${band?.bandName ?? 'request'}`} rule="m" />
        {!band ? (
          <p>That request no longer exists.</p>
        ) : (
          <>
            <ul className="divide-surface-ink/20 border-surface-ink/20 divide-y border-y">
              {list.map((b) => {
                const clash = reasons.get(b.id);
                const status = displayStatus(b);
                const decided = status === 'confirmed' || status === 'declined';
                return (
                  <li key={b.id} className="flex flex-col gap-1 py-3">
                    <span className="flex flex-wrap items-baseline gap-x-4">
                      <strong>{sessionLabel(b.startsAt, b.endsAt)}</strong>
                      <span className="text-text-meta">{b.catalogueId}</span>
                      {settings.paymentsEnabled && <span>{money(b.priceCents)}</span>}
                      <span
                        className={`text-data-overline-11 ml-auto font-bold tracking-[--spacing(0.625)] uppercase ${
                          status === 'confirmed' ? 'text-accent-red' : ''
                        }`}
                      >
                        {STATUS[status]}
                      </span>
                    </span>
                    {decided && (
                      <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="opacity-70">
                          {b.bandEmailedAt ? 'Band emailed' : 'Band not emailed yet — resend from Requests in admin'}
                          {status === 'declined' && b.declineReason ? ` · “${b.declineReason}”` : ''}
                        </span>
                        {status === 'confirmed' &&
                          settings.paymentsEnabled &&
                          (isAdmin ? (
                            <span className="ml-auto">
                              <PaymentButtons id={b.id} status={b.paymentStatus} method={b.paymentMethod} look="paper" />
                            </span>
                          ) : (
                            <span className="ml-auto opacity-70">
                              {b.paymentStatus === 'unpaid' ? 'Unpaid' : b.paymentStatus === 'paid' ? 'Paid ✓' : b.paymentStatus}
                              {' · '}
                              <Link
                                href={`/admin/rehearsal/bands/${b.bandId}`}
                                className="hover:text-accent-red underline underline-offset-4"
                              >
                                log in to mark paid
                              </Link>
                            </span>
                          ))}
                      </span>
                    )}
                    {repeatLabel(b) && <span className="opacity-70">↻ {repeatLabel(b)}</span>}
                    {b.replacesStartsAt && b.replacesEndsAt && (
                      <span className="opacity-70">
                        Change from {sessionLabel(b.replacesStartsAt, b.replacesEndsAt)} ({b.replacesCatalogueId}
                        {b.replacesStatus === 'confirmed'
                          ? status === 'confirmed'
                            ? ''
                            : ', stays booked until you approve'
                          : ''}
                        ){status === 'confirmed' && b.replacesStatus === 'cancelled' ? ' — released' : ''}
                      </span>
                    )}
                    {clash && (
                      <span className="text-accent-red">Heads up: {clash.map((r) => REASON[r] ?? r).join('; ')}.</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
              <dt className="opacity-70">Gear</dt>
              <dd>{gear || 'nothing from the house'}</dd>
              {band.note && (
                <>
                  <dt className="opacity-70">Note</dt>
                  <dd className="whitespace-pre-line">{band.note}</dd>
                </>
              )}
              {band.rateNotes && (
                <>
                  <dt className="opacity-70">Rate notes</dt>
                  <dd>{band.rateNotes}</dd>
                </>
              )}
              {settings.paymentsEnabled && (
                <>
                  <dt className="opacity-70">Pays by</dt>
                  <dd className="capitalize">{band.paymentMethod}</dd>
                </>
              )}
            </dl>
            {actionable.length > 0 && (!calendarChecked || list.some((b) => b.calendarUnchecked)) && (
              <p className="text-accent-red">Couldn&apos;t check your calendar for this request — check it before approving.</p>
            )}
            {p.a === 'approve' && actionable.length > 0 && !settings.address && (
              <p className="text-accent-red">
                No address is set in Rehearsal Settings, so the confirmation will go out without one.
              </p>
            )}
            {actionable.length > 0 && <ReviewActions token={token} action={p.a} count={actionable.length} />}
          </>
        )}
        <p>
          <Link href="/admin/rehearsal/requests" className="hover:text-accent-red underline underline-offset-4">
            All requests in admin
          </Link>
        </p>
      </section>
    </SiteFrame>
  );
}
