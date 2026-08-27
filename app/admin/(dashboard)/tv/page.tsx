import { getGlobalProgram, getAllCards } from '@/lib/tv-program';
import { getAllTvImages } from '@/lib/tv-images';
import TvProgramControl from '@/components/admin/TvProgramControl';
import TvCardsList from '@/components/admin/TvCardsList';
import TvImagesList from '@/components/admin/TvImagesList';

export const dynamic = 'force-dynamic';

export default async function AdminTvPage() {
  const [program, cards, images] = await Promise.all([
    getGlobalProgram(),
    getAllCards(null),
    getAllTvImages(),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-6 pb-16 pt-6 space-y-12">
      <div>
        <h2 className="text-xl font-bold text-[#E8E0D0] mb-1">TV Screen</h2>
        <p className="text-sm text-[#E8E0D0]/50 max-w-2xl">
          The in-venue tube is authored here — you set which mode is on screen (now, on a schedule,
          or by default) and edit each mode’s content below. Nothing is pulled from show data
          automatically.
        </p>
      </div>

      <TvProgramControl initialProgram={program} />

      <div className="border-t border-[#E8E0D0]/15 pt-8">
        <TvImagesList initialImages={images} />
      </div>

      <div className="border-t border-[#E8E0D0]/15 pt-8">
        <TvCardsList initialCards={cards} />
      </div>
    </main>
  );
}
