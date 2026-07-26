import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { sql } from '@/lib/db';
import { computeSettlementSummary, settlementValuesFromRow, type SettlementDbRow } from '@/lib/settlements';
import { getShowBandsPaidStatus } from '@/lib/bands';
import SettlementPdfDocument from '@/components/admin/SettlementPdfDocument';

export const runtime = 'nodejs';

function parseId(id: string): number | null {
  const parsed = Number(id);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId: showIdParam } = await params;
  const showId = parseId(showIdParam);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid show id' }, { status: 400 });
  }

  const [show] = await sql<{ id: number; title: string; date: string | null }[]>`
    select id, title, date::text as date from shows where id = ${showId}
  `;
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const [settlementRow] = await sql<SettlementDbRow[]>`select * from settlements where show_id = ${showId}`;
  if (!settlementRow) {
    return NextResponse.json({ error: 'No settlement recorded' }, { status: 404 });
  }

  // Only bands that aren't excluded share the payout, so the PDF's per-band
  // figure divides the artist pool by the included count. The full list (with
  // exclusion flags) is passed through so the PDF can show excluded bands too.
  const bands = await getShowBandsPaidStatus(showId);
  const payoutBandCount = bands.filter((b) => !b.excluded).length;

  const values = settlementValuesFromRow(settlementRow);
  const summary = computeSettlementSummary(values, payoutBandCount);

  const buffer = await renderToBuffer(
    <SettlementPdfDocument showTitle={show.title} showDate={show.date} values={values} summary={summary} bands={bands} />
  );

  const filename = `settlement-${show.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
