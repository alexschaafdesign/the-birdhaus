import { notFound } from 'next/navigation';
import { sql } from '@/lib/db';
import CopySummaryButton from '@/components/admin/CopySummaryButton';
import SettlementForm from '@/components/admin/SettlementForm';
import { getShowBandsPaidStatus } from '@/lib/bands';
import { getShowPurchaseMatches } from '@/lib/square';
import {
  computeSettlementSummary,
  settlementEmailSummary,
  settlementValuesFromRow,
  DEFAULT_SETTLEMENT_VALUES,
  FEE_INCOME_FIELDS,
  type SettlementDbRow,
} from '@/lib/settlements';

export const dynamic = 'force-dynamic';

export default async function SettlementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const [show] = await sql<
    {
      id: number;
      title: string;
      date: string;
      sound_engineer_name: string | null;
      door_person_name: string | null;
      walkin_count: number;
    }[]
  >`
    select id, title, date::text as date, sound_engineer_name, door_person_name, walkin_count from shows where id = ${showId}
  `;
  if (!show) notFound();

  // The night's door headcount: per-person RSVP check-ins from the door kiosk
  // plus anonymous walk-ins. Used to pre-fill official attendance and offered
  // as an "apply" hint in the form (mirroring the advance-sales pre-fill).
  const [{ arrived }] = await sql<{ arrived: number }[]>`
    select coalesce(sum(arrived_count), 0)::int as arrived from rsvps where show_id = ${showId}
  `;
  const doorCount = arrived + show.walkin_count;
  const doorAttendance = doorCount > 0 ? doorCount : null;

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  const bands = await getShowBandsPaidStatus(showId);
  // Only non-excluded bands share the payout split.
  const includedBands = bands.filter((b) => !b.excluded);
  const payoutBandCount = includedBands.length;

  // Sound-engineer photos keyed by lowercased name. The settlement's engineer
  // payee is free text (settlements.sound_engineer_name), so we match it back to
  // the registry by name to show the engineer's avatar on the sheet. The payment
  // handle (Venmo etc.) rides along the same way so it's on hand when paying out.
  const engineerRows = await sql<{ name: string; photo: string | null; payment_method: string | null }[]>`
    select name, photo, payment_method from sound_engineers order by name asc
  `;
  const soundEngineerPhotos: Record<string, string> = {};
  for (const row of engineerRows) {
    if (row.photo) soundEngineerPhotos[row.name.trim().toLowerCase()] = row.photo;
  }
  // Full registry list for the settlement form's "change engineer" menu.
  const soundEngineers = engineerRows.map((row) => ({
    name: row.name,
    photo: row.photo,
    paymentMethod: row.payment_method,
  }));

  // Photographers registry — same treatment as sound engineers.
  const photographerRows = await sql<{ name: string; photo: string | null; payment_method: string | null }[]>`
    select name, photo, payment_method from photographers order by name asc
  `;
  const photographerPhotos: Record<string, string> = {};
  for (const row of photographerRows) {
    if (row.photo) photographerPhotos[row.name.trim().toLowerCase()] = row.photo;
  }
  const photographers = photographerRows.map((row) => ({
    name: row.name,
    photo: row.photo,
    paymentMethod: row.payment_method,
  }));

  // Door-person registry — same treatment as sound engineers / photographers.
  const doorPersonRows = await sql<{ name: string; photo: string | null; payment_method: string | null }[]>`
    select name, photo, payment_method from door_persons order by name asc
  `;
  const doorPersonPhotos: Record<string, string> = {};
  for (const row of doorPersonRows) {
    if (row.photo) doorPersonPhotos[row.name.trim().toLowerCase()] = row.photo;
  }
  const doorPersons = doorPersonRows.map((row) => ({
    name: row.name,
    photo: row.photo,
    paymentMethod: row.payment_method,
  }));

  // Live advance ticket-sales total from Square (matched RSVP purchases + any
  // unmatched buyers), same figure the RSVP admin shows. Best-effort: 0 when
  // Square is off or the show was never synced. Used to pre-fill the Square income
  // field and offered as an "apply" hint in the form.
  const purchaseMatches = await getShowPurchaseMatches(showId, []);
  const advanceSalesCents =
    Object.values(purchaseMatches.purchasesByEmail).reduce((sum, p) => sum + p.totalCents, 0) +
    purchaseMatches.unmatchedBuyers.reduce((sum, b) => sum + b.amountCents, 0);
  const advanceTicketSalesDollars = advanceSalesCents > 0 ? advanceSalesCents / 100 : null;

  // Pre-fill the sound-engineer payee from the show's confirmed engineer (cached
  // on shows.sound_engineer_name, kept in sync by setShowSoundEngineers) and seed
  // Square income from advance ticket sales — both only when no settlement exists
  // yet (a saved row is never overwritten). The Square value stays editable, and
  // the form offers an "apply" hint to re-sync it as more sales come in.
  const squareFeeRate = FEE_INCOME_FIELDS.find((f) => f.incomeKeys.includes('incomeSquare'))?.rate ?? 0;
  const initialValues = settlementRow
    ? settlementValuesFromRow(settlementRow)
    : {
        ...DEFAULT_SETTLEMENT_VALUES,
        soundEngineerName: show.sound_engineer_name,
        doorPersonName: show.door_person_name,
        attendance: doorAttendance,
        incomeSquare: advanceTicketSalesDollars ?? DEFAULT_SETTLEMENT_VALUES.incomeSquare,
        expSquareFees: advanceTicketSalesDollars
          ? Number((advanceTicketSalesDollars * squareFeeRate).toFixed(2))
          : DEFAULT_SETTLEMENT_VALUES.expSquareFees,
      };

  // Copy-summary and PDF read the saved record, so only offer them once a
  // settlement has actually been recorded.
  const emailSummary = settlementRow
    ? settlementEmailSummary(
        show.title,
        show.date,
        initialValues,
        computeSettlementSummary(
          initialValues,
          payoutBandCount,
          includedBands.map((b) => b.payoutOverride),
          includedBands.map((b) => b.payoutPct)
        ),
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

      <SettlementForm
        showId={showId}
        bands={bands}
        initialValues={initialValues}
        advanceTicketSalesDollars={advanceTicketSalesDollars}
        doorAttendance={doorAttendance}
        soundEngineerPhotos={soundEngineerPhotos}
        soundEngineers={soundEngineers}
        photographerPhotos={photographerPhotos}
        photographers={photographers}
        doorPersonPhotos={doorPersonPhotos}
        doorPersons={doorPersons}
      />
    </div>
  );
}
