import { sql } from '@/lib/db';
import BandsList, { type BandListItem } from '@/components/admin/BandsList';

export const dynamic = 'force-dynamic';

async function getBands(): Promise<BandListItem[]> {
  const rows = await sql<
    BandListItem[]
  >`select b.*,
      (select count(*)::int from show_bands sb where sb.band_id = b.id) as show_count
    from bands b
    order by b.name asc`;
  return rows;
}

export default async function AdminBandsPage() {
  const bands = await getBands();
  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6">
      <BandsList initialBands={bands} />
    </main>
  );
}
