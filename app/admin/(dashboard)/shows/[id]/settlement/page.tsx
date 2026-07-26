import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import CopySummaryButton from '@/components/admin/CopySummaryButton';
import SettlementForm from '@/components/admin/SettlementForm';
import { getShowBandsPaidStatus } from '@/lib/bands';
import {
  computeSettlementSummary,
  settlementEmailSummary,
  settlementValuesFromRow,
  DEFAULT_SETTLEMENT_VALUES,
  type SettlementDbRow,
} from '@/lib/settlements';

export const dynamic = 'force-dynamic';

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<{ id: number; title: string; date: string; sound_engineer_name: string | null }[]>`
    select id, title, date::text as date, sound_engineer_name from shows where id = ${showId}
  `;
  if (!show) notFound();

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  const bands = await getShowBandsPaidStatus(showId);
  // Only non-excluded bands share the payout split.
  const payoutBandCount = bands.filter((b) => !b.excluded).length;

  // Pre-fill the sound-engineer payee from the show's confirmed engineer (cached
  // on shows.sound_engineer_name, kept in sync by setShowSoundEngineers) when no
  // settlement exists yet.
  const initialValues = settlementRow
    ? settlementValuesFromRow(settlementRow)
    : { ...DEFAULT_SETTLEMENT_VALUES, soundEngineerName: show.sound_engineer_name };

  // Copy-summary and PDF read the saved record, so only offer them once a
  // settlement has actually been recorded.
  const emailSummary = settlementRow
    ? settlementEmailSummary(
        show.title,
        show.date,
        initialValues,
        computeSettlementSummary(initialValues, payoutBandCount),
        payoutBandCount
      )
    : null;
  const pdfHref = `/api/admin/settlements/${showId}/pdf`;

  return (
    <div className="space-y-6">
      {emailSummary && (
        <div className="flex items-center justify-end gap-2">
          <CopySummaryButton text={emailSummary} />
          <a
            href={pdfHref}
            title="Download PDF"
            className="flex items-center gap-1.5 text-sm border border-[#E8E0D0]/30 rounded px-3 py-1.5 hover:bg-[#E8E0D0]/10 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v13m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            PDF
          </a>
        </div>
      )}

      <SettlementForm showId={showId} bands={bands} initialValues={initialValues} />
    </div>
  );
}
