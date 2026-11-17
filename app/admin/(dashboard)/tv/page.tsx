import { getGlobalProgram, getAllCards, getLiveTubeTarget } from '@/lib/tv-program';
import { getAllTvImages } from '@/lib/tv-images';
import { PageHeader } from '@/components/admin/ui';
import TvProgramControl from '@/components/admin/TvProgramControl';
import TvCardsList from '@/components/admin/TvCardsList';
import TvImagesList from '@/components/admin/TvImagesList';
import TvPreview from '@/components/admin/TvPreview';

export const dynamic = 'force-dynamic';

export default async function AdminTvPage() {
  const [program, cards, images, liveTube] = await Promise.all([
    getGlobalProgram(),
    getAllCards(null),
    getAllTvImages(),
    getLiveTubeTarget(),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 pt-8 pb-16 sm:px-8">
      <PageHeader
        overline="Shows"
        title="TV Screen"
        description="The in-venue tube is authored here — you set which mode is on screen (now, on a schedule, or by default) and edit each mode’s content below. Nothing is pulled from show data automatically."
      />

      <TvProgramControl initialProgram={program} liveTube={liveTube} />

      <div className="border-t border-surface-ink pt-8">
        <TvPreview />
      </div>

      <div className="border-t border-surface-ink pt-8">
        <TvImagesList initialImages={images} />
      </div>

      <div className="border-t border-surface-ink pt-8">
        <TvCardsList initialCards={cards} />
      </div>
    </main>
  );
}
