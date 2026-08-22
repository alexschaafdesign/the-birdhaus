import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDoorData } from '@/lib/door';
import DoorCheckIn from '@/components/door/DoorCheckIn';

export const dynamic = 'force-dynamic';

// Token-gated kiosk link — keep it out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// A full-screen "I'm here!" check-in view meant to sit on an iPad at the front
// door. The host or arriving guests tap their name (once per head), and a walk-in
// counter catches everyone who never RSVP'd — together giving a live show total.
export default async function DoorPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getDoorData(token);
  if (!data) notFound();

  return <DoorCheckIn token={token} data={data} />;
}
