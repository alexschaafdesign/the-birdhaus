import { forAdmin, getDayWindows, getRehearsalSettings } from '@/lib/rehearsal/settings';
import RehearsalSettingsForm from '@/components/admin/rehearsal/RehearsalSettingsForm';
import BookingHoursEditor from '@/components/admin/rehearsal/BookingHoursEditor';
import RatesEditor from '@/components/admin/rehearsal/RatesEditor';
import RehearsalFeedLink from '@/components/admin/rehearsal/RehearsalFeedLink';

export const dynamic = 'force-dynamic';

export default async function RehearsalSettingsPage() {
  const [settings, windows] = await Promise.all([getRehearsalSettings(), getDayWindows()]);

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-12">
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Booking hours</h2>
          <p className="text-sm text-[#E8E0D0]/55">
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
          <h2 className="text-xl font-bold">Rates</h2>
          <p className="text-sm text-[#E8E0D0]/55">
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
          <h2 className="text-xl font-bold">Your rehearsal calendar</h2>
          <p className="text-sm text-[#E8E0D0]/55">
            A private feed of confirmed rehearsals (band, gear, payment) to subscribe to in Apple Calendar. Keep the
            link to yourself.
          </p>
        </div>
        <RehearsalFeedLink />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Rehearsal settings</h2>
        <RehearsalSettingsForm initial={forAdmin(settings)} />
      </section>
    </main>
  );
}
