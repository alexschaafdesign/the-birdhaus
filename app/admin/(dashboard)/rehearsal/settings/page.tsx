import { forAdmin, getRehearsalSettings, getStandingHours } from '@/lib/rehearsal/settings';
import RehearsalSettingsForm from '@/components/admin/rehearsal/RehearsalSettingsForm';
import StandingHoursEditor from '@/components/admin/rehearsal/StandingHoursEditor';

export const dynamic = 'force-dynamic';

export default async function RehearsalSettingsPage() {
  const [settings, hours] = await Promise.all([getRehearsalSettings(), getStandingHours()]);

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-12">
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Standing hours</h2>
          <p className="text-sm text-[#E8E0D0]/55">
            The weekly blocks bands can pick from (Chicago time). Every block starts open; show days,
            your calendar, bookings and blackouts take blocks away automatically.
          </p>
        </div>
        <StandingHoursEditor initial={hours} blockMinutes={settings.blockMinutes} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Rehearsal settings</h2>
        <RehearsalSettingsForm initial={forAdmin(settings)} />
      </section>
    </main>
  );
}
