import { getDefaultAdvanceTemplate } from '@/lib/advance';
import { getPortalInfo } from '@/lib/portal-content';
import AdvanceTemplateEditor from '@/components/admin/AdvanceTemplateEditor';
import PortalInfoEditor from '@/components/admin/PortalInfoEditor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [template, portalInfo] = await Promise.all([
    getDefaultAdvanceTemplate(),
    getPortalInfo(),
  ]);

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-12">
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Advance email template</h2>
          <p className="text-sm text-[#E8E0D0]/55">
            The short boilerplate sent to bands ahead of each show — mostly a
            pointer to the band portal. Per-show details (schedule, sound
            engineer, show link, lineup) fill in when you compose an advance from
            a show&apos;s Advance tab.
          </p>
        </div>
        <AdvanceTemplateEditor initial={template} />
      </section>

      <section className="space-y-6 border-t border-[#E8E0D0]/10 pt-10">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Portal info</h2>
          <p className="text-sm text-[#E8E0D0]/55">
            The venue/logistics rundown shown to bands on the show portal (the
            /hub page) — venue, capacity, accessibility, backline, recording,
            parking, WiFi, and the rest. Static across shows; schedule, pay, RSVP
            count, and input needs each have their own portal card.
          </p>
        </div>
        <PortalInfoEditor initial={portalInfo} />
      </section>
    </main>
  );
}
