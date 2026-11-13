import { bookingUrl, listBands } from '@/lib/rehearsal/bands';
import RehearsalBands from '@/components/admin/rehearsal/RehearsalBands';

export const dynamic = 'force-dynamic';

// Phase 3: add a band and manage its private booking link. Notes, history
// and totals arrive with Phase 4.
export default async function RehearsalBandsPage() {
  const bands = await listBands();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold">Rehearsal bands</h2>
        <p className="text-sm text-[#E8E0D0]/55">
          Each band books through its own private link. Replacing a link stops the old one working.
        </p>
      </div>
      <RehearsalBands initial={bands.map((b) => ({ ...b, url: b.token ? bookingUrl(b.token) : null }))} />
    </main>
  );
}
