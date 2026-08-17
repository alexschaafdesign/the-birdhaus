import { getDefaultAdvanceTemplate } from '@/lib/advance';
import { getPortalInfo } from '@/lib/portal-content';
import { getMailchimpConfigStatus } from '@/lib/mailchimp';
import { sql } from '@/lib/db';
import AdvanceTemplateEditor from '@/components/admin/AdvanceTemplateEditor';
import PortalInfoEditor from '@/components/admin/PortalInfoEditor';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [template, portalInfo, optInRows] = await Promise.all([
    getDefaultAdvanceTemplate(),
    getPortalInfo(),
    sql<{ n: number }[]>`select count(*)::int as n from rsvps where email_list_opt_in = true`,
  ]);
  const mailchimp = getMailchimpConfigStatus();
  const optInCount = optInRows[0]?.n ?? 0;

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-12">
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">Mailing list (Mailchimp)</h2>
          <p className="text-sm text-[#E8E0D0]/55">
            When someone checks &ldquo;add me to the mailing list&rdquo; while
            RSVPing, they&apos;re synced to Mailchimp. This needs{' '}
            <code className="text-[#E8E0D0]/80">MAILCHIMP_API_KEY</code> and{' '}
            <code className="text-[#E8E0D0]/80">MAILCHIMP_AUDIENCE_ID</code> set
            in the Vercel environment.
          </p>
        </div>
        {mailchimp.configured ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            <span className="font-semibold text-emerald-300">Configured.</span>{' '}
            <span className="text-[#E8E0D0]/70">
              Opt-ins sync to Mailchimp
              {mailchimp.datacenter ? ` (${mailchimp.datacenter})` : ''}. Live
              check: <code>/api/health/mailchimp?live=1</code>.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
            <span className="font-semibold text-red-300">Not configured</span>{' '}
            <span className="text-[#E8E0D0]/70">
              — RSVP opt-ins are being collected but{' '}
              <span className="font-semibold text-red-300">dropped</span> (not
              added to Mailchimp). Missing{' '}
              {!mailchimp.apiKeyPresent && <code>MAILCHIMP_API_KEY</code>}
              {!mailchimp.apiKeyPresent && !mailchimp.audiencePresent && ' and '}
              {!mailchimp.audiencePresent && <code>MAILCHIMP_AUDIENCE_ID</code>}.
            </span>
          </div>
        )}
        <p className="text-sm text-[#E8E0D0]/55">
          {optInCount} RSVP{optInCount === 1 ? '' : 's'} have opted into the
          mailing list to date.
        </p>
      </section>

      <section className="space-y-6 border-t border-[#E8E0D0]/10 pt-10">
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
