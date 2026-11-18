import { forAdmin, getDayWindows, getRehearsalSettings } from '@/lib/rehearsal/settings';
import RehearsalSettingsForm from '@/components/admin/rehearsal/RehearsalSettingsForm';
import BookingHoursEditor from '@/components/admin/rehearsal/BookingHoursEditor';
import RatesEditor from '@/components/admin/rehearsal/RatesEditor';
import RehearsalFeedLink from '@/components/admin/rehearsal/RehearsalFeedLink';
import { ADMIN_TYPE, PageHeader } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function RehearsalSettingsPage() {
  const [settings, windows] = await Promise.all([getRehearsalSettings(), getDayWindows()]);

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader overline="Rehearsal" title="Settings" />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className={ADMIN_TYPE.heading}>Booking hours</h2>
          <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted} max-w-prose`}>
            The outer limit of each day (Chicago time). Everything inside is open unless something blocks it: show
            days, your calendar, other bookings (plus the turnover), and blocks you add on the Calendar.
          </p>
        </div>
        <BookingHoursEditor
          initialWindows={windows}
          initialRules={{
            startStepMinutes: settings.startStepMinutes,
            allowedLengths: settings.allowedLengths,
            minMinutes: settings.minMinutes,
            maxMinutes: settings.maxMinutes,
            bufferMinutes: settings.bufferMinutes,
          }}
        />
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className={ADMIN_TYPE.heading}>Rates</h2>
          <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted} max-w-prose`}>
            An informal rate card, shown on /rehearsal and in the invite email. Display only: nothing is billed or
            tracked as owed.
          </p>
        </div>
        <RatesEditor
          initial={{
            rateHourlyCents: settings.rateHourlyCents,
            ratePackages: settings.ratePackages,
            rateRegularText: settings.rateRegularText,
            rateFlexibleText: settings.rateFlexibleText,
            estimatesEnabled: settings.estimatesEnabled,
          }}
        />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className={ADMIN_TYPE.heading}>Your rehearsal calendar</h2>
          <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted} max-w-prose`}>
            A private feed of confirmed rehearsals (band, gear, payment) to subscribe to in Apple Calendar. Keep the
            link to yourself.
          </p>
        </div>
        <RehearsalFeedLink />
      </section>

      <section className="space-y-4">
        <h2 className={ADMIN_TYPE.heading}>Rehearsal settings</h2>
        <RehearsalSettingsForm initial={forAdmin(settings)} />
      </section>
    </main>
  );
}
