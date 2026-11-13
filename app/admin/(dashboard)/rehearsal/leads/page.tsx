import { listLeads } from '@/lib/rehearsal/leads';
import { FREQUENCY_LABEL } from '@/lib/rehearsal/lead-rules';
import RehearsalLeads from '@/components/admin/rehearsal/RehearsalLeads';

export const dynamic = 'force-dynamic';

export default async function RehearsalLeadsPage() {
  const leads = await listLeads();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Leads</h2>
        <p className="text-sm text-[#E8E0D0]/55">
          From the &ldquo;I&apos;m interested&rdquo; form on /rehearsal. Invite creates the band and emails them their
          private booking link.
        </p>
      </div>
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
