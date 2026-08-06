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
    <main className="mx-auto w-full max-w-5xl px-6 py-8 text-[#E8E0D0]">
      <TimesheetView initialEntries={entries} />
    </main>
  );
}
