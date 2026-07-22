import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { DEFAULT_SETTLEMENT_VALUES, settlementValuesFromRow, type SettlementDbRow } from '@/lib/settlements';
import { getShowBandsPaidStatus } from '@/lib/bands';
import SettlementForm from '@/components/admin/SettlementForm';

export const dynamic = 'force-dynamic';

export default async function EditSettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string; sound_engineer_name: string | null }[]>`
    select id, title, sound_engineer_name from shows where id = ${showId}
  `;
  if (!show) notFound();

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  const bands = await getShowBandsPaidStatus(showId);

  // Pre-fill the sound-engineer payee from the show's confirmed engineer (cached
  // on shows.sound_engineer_name, kept in sync by setShowSoundEngineers) when no
  // settlement exists yet.
  const initialValues = settlementRow
    ? settlementValuesFromRow(settlementRow)
    : { ...DEFAULT_SETTLEMENT_VALUES, soundEngineerName: show.sound_engineer_name };

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
      <SettlementForm showId={showId} bandCount={bands.length} bands={bands} initialValues={initialValues} />
    </main>
  );
}
