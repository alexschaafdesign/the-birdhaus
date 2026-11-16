import type { Metadata } from 'next';
import { listEntries } from '@/lib/timesheet';
import TimesheetView from '@/components/admin/TimesheetView';

export const metadata: Metadata = {
  title: 'Timesheet',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminTimesheetPage() {
  const entries = await listEntries();
  return (
    <main className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-8">
      <TimesheetView initialEntries={entries} />
    </main>
  );
}
