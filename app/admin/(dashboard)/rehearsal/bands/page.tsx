import { bookingUrl, listBands } from '@/lib/rehearsal/bands';
import RehearsalBands from '@/components/admin/rehearsal/RehearsalBands';
import { PageHeader } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

// Phase 3: add a band and manage its private booking link. Notes, history
// and totals arrive with Phase 4.
export default async function RehearsalBandsPage() {
  const bands = await listBands();
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader
        overline="Rehearsal"
        title="Bands"
        description="Each band books through its own private link. Replacing a link stops the old one working."
      />
      <RehearsalBands initial={bands.map((b) => ({ ...b, url: b.token ? bookingUrl(b.token) : null }))} />
    </main>
  );
}
