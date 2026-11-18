import { listLeads } from '@/lib/rehearsal/leads';
import { FREQUENCY_LABEL } from '@/lib/rehearsal/lead-rules';
import RehearsalLeads from '@/components/admin/rehearsal/RehearsalLeads';
import { PageHeader } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

export default async function RehearsalLeadsPage() {
  const leads = await listLeads();
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader
        overline="Rehearsal"
        title="Leads"
        description={
          <>
            From the &ldquo;I&apos;m interested&rdquo; form on /rehearsal. Invite creates the band and emails them
            their private booking link.
          </>
        }
      />
      <RehearsalLeads
        leads={leads.map((l) => ({
          id: l.id,
          name: l.name,
          project: l.project,
          email: l.email,
          phone: l.phone,
          people: l.people,
          frequency: FREQUENCY_LABEL[l.frequency] ?? l.frequency,
          preferredTimes: l.preferredTimes,
          genreLinks: l.genreLinks,
          notes: l.notes,
          status: l.status,
          bandId: l.bandId,
          created: l.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }),
        }))}
      />
    </main>
  );
}
