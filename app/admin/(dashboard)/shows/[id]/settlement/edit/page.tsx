import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { settlementValuesFromRow, type SettlementDbRow } from '@/lib/settlements';
import SettlementForm from '@/components/admin/SettlementForm';

export const dynamic = 'force-dynamic';

export default async function EditSettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string }[]>`select id, title from shows where id = ${showId}`;
  if (!show) notFound();

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  const [{ count: bandCount }] = await sql<
    { count: number }[]
  >`select count(*)::int as count from show_bands where show_id = ${showId}`;

  const initialValues = settlementRow ? settlementValuesFromRow(settlementRow) : null;

  return (
    <main className="max-w-4xl mx-auto px-6 pb-16 pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit settlement — {show.title}</h1>
        <Link
          href={`/admin/shows/${showId}/settlement`}
          className="text-sm text-[#E8E0D0]/60 hover:text-[#E8E0D0]"
        >
          ← Back to settlement
        </Link>
      </div>
      <SettlementForm showId={showId} bandCount={bandCount} initialValues={initialValues} />
    </main>
  );
}
