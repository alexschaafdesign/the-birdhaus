import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sql } from '@/lib/db';
import { getProgramOrBlank, getAllCards } from '@/lib/tv-program';
import TvProgramControl from '@/components/admin/TvProgramControl';
import TvCardsList from '@/components/admin/TvCardsList';

export const dynamic = 'force-dynamic';

// Per-show TV programming (day-of). Authors this show's own program — override,
// schedule, board, cards — which the tube prefers over the global default on
// this show's date. The screensaver image pool is shared (global), edited in
// the main TV Screen settings.
export default async function ShowTvPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const showId = Number(id);
  if (!Number.isInteger(showId)) notFound();

  const bandRows = await sql<Array<{ name: string }>>`
    select b.name
    from show_bands sb
    join bands b on b.id = sb.band_id
    where sb.show_id = ${showId} and not sb.excluded
    order by sb.sort_order asc
  `;
  const bandNames = bandRows.map((r) => r.name);

  const [program, cards] = await Promise.all([
    getProgramOrBlank(showId),
    getAllCards(showId),
  ]);

  return (
    <div className="space-y-10">
      <p className="text-sm text-[#E8E0D0]/50 max-w-2xl">
        This night’s TV program. On this show’s date the tube uses what you set here instead of the{' '}
        <Link href="/admin/tv" className="underline hover:text-[#E8E0D0]">
          global default
        </Link>
        . The screensaver image pool is shared across all nights — edit it in the global{' '}
        <Link href="/admin/tv" className="underline hover:text-[#E8E0D0]">
          TV Screen
        </Link>{' '}
        settings.
      </p>

      <TvProgramControl initialProgram={program} showId={showId} bandNames={bandNames} />

      <div className="border-t border-[#E8E0D0]/15 pt-8">
        <TvCardsList initialCards={cards} showId={showId} />
      </div>
    </div>
  );
}
