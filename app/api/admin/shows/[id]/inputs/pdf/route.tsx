import { NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { sql } from '@/lib/db';
import { getShowInputsState } from '@/lib/inputs';
import InputsPdfDocument from '@/components/admin/InputsPdfDocument';

// Auth is enforced centrally in proxy.ts for all /api/admin/* routes.
export const runtime = 'nodejs';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = parseId(id);
  if (showId === null) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const [show] = await sql<{ title: string; date: string | null; slug: string }[]>`
    select title, date::text as date, slug from shows where id = ${showId}
  `;
  if (!show) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  // The PDF reflects the saved items (same source the tab reads).
  const state = await getShowInputsState(showId);
  if (!state) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 });
  }

  const buffer = await renderToBuffer(
    <InputsPdfDocument
      showTitle={show.title}
      showDate={show.date}
      total={state.total}
      bands={state.bands}
    />
  );

  const filename = `inputs-${(show.slug || show.title.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
