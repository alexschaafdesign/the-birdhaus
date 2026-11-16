import { getDefaultAdvanceTemplate } from '@/lib/advance';
import { getAdvanceWatchers } from '@/lib/advance-watchers';
import { getPortalInfo } from '@/lib/portal-content';
import { getMailchimpConfigStatus } from '@/lib/mailchimp';
import { sql } from '@/lib/db';
import AdvanceTemplateEditor from '@/components/admin/AdvanceTemplateEditor';
import AdvanceWatchersEditor from '@/components/admin/AdvanceWatchersEditor';
import PortalInfoEditor from '@/components/admin/PortalInfoEditor';
import { PageHeader, Panel, StatusMark } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [template, watchers, portalInfo, optInRows] = await Promise.all([
    getDefaultAdvanceTemplate(),
    getAdvanceWatchers(),
    getPortalInfo(),
    sql<{ n: number }[]>`select count(*)::int as n from rsvps where email_list_opt_in = true`,
  ]);
  const mailchimp = getMailchimpConfigStatus();
  const optInCount = optInRows[0]?.n ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <PageHeader overline="Settings" title="Settings" />

      <div className="space-y-6">
        <Panel title="Mailing list (Mailchimp)">
          <div className="space-y-4">
            <p className="text-body-3 text-surface-ink/60 max-w-prose">
              When someone checks &ldquo;add me to the mailing list&rdquo; while
              RSVPing, they&apos;re synced to Mailchimp. This needs{' '}
              <code className="text-surface-ink">MAILCHIMP_API_KEY</code> and{' '}
              <code className="text-surface-ink">MAILCHIMP_AUDIENCE_ID</code> set
              in the Vercel environment.
            </p>
            {mailchimp.configured ? (
              <div className="border-surface-ink text-body-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-2 p-3">
                <StatusMark tone="ok">Configured</StatusMark>
                <span className="text-surface-ink/70">
                  Opt-ins sync to Mailchimp
                  {mailchimp.datacenter ? ` (${mailchimp.datacenter})` : ''}. Live
                  check: <code>/api/health/mailchimp?live=1</code>.
                </span>
              </div>
            ) : (
              <div role="alert" className="border-accent-red text-body-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-2 p-3">
                <StatusMark tone="problem">Not configured</StatusMark>
                <span className="text-surface-ink/70">
                  — RSVP opt-ins are being collected but{' '}
                  <span className="text-accent-red font-bold">dropped</span> (not
                  added to Mailchimp). Missing{' '}
                  {!mailchimp.apiKeyPresent && <code>MAILCHIMP_API_KEY</code>}
                  {!mailchimp.apiKeyPresent && !mailchimp.audiencePresent && ' and '}
                  {!mailchimp.audiencePresent && <code>MAILCHIMP_AUDIENCE_ID</code>}.
                </span>
              </div>
            )}
            <p className="text-body-3 text-surface-ink/60">
              {optInCount} RSVP{optInCount === 1 ? '' : 's'} have opted into the
              mailing list to date.
            </p>
          </div>
        </Panel>

        <Panel title="Portal invite email">
          <p className="text-body-3 text-surface-ink/60 mb-5 max-w-prose">
            The short boilerplate emailed to bands ahead of each show — an
            invitation pointing them at their show portal. Per-show details
            (schedule, sound engineer, show link, lineup) fill in when you send
            it from a show&apos;s Portal tab.
          </p>
          <AdvanceTemplateEditor initial={template} />
        </Panel>

        <Panel title="Watchers">
          <p className="text-body-3 text-surface-ink/60 mb-5 max-w-prose">
            Who&apos;s CC&apos;d on every portal invite and thread message, and
            notified when a band replies or does something in the show portal
            (stage plot, message, schedule response). Replies-all from bands
            reach these inboxes directly.
          </p>
          <AdvanceWatchersEditor initial={watchers} />
        </Panel>

        <Panel title="Portal info">
          <p className="text-body-3 text-surface-ink/60 mb-5 max-w-prose">
            The venue/logistics rundown shown to bands on the show portal (the
            /hub page) — venue, capacity, accessibility, backline, recording,
            parking, WiFi, and the rest. Static across shows; schedule, pay, RSVP
            count, and input needs each have their own portal card.
          </p>
          <PortalInfoEditor initial={portalInfo} />
        </Panel>
      </div>
    </main>
  );
}
