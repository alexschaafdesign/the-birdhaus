import { sql } from '@/lib/db';
import SubmissionsBoard from '@/components/admin/SubmissionsBoard';
import type { Submission } from '@/lib/submissions';

export const dynamic = 'force-dynamic';

async function getSubmissions(): Promise<Submission[]> {
  const rows = await sql<Submission[]>`select * from submissions order by created_at desc`;
  return rows;
}

export default async function AdminPage() {
  const submissions = await getSubmissions();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16">
      <SubmissionsBoard initialSubmissions={submissions} />
    </main>
  );
}
