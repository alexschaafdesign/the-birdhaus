import { getAllShows, getTodayCentral } from '@/lib/shows';
import { getFreshCutsContent } from '@/lib/page-content';
import { isAdminSession } from '@/lib/admin-session';
import ShowCard from '@/components/ShowCard';
import FreshCutsIntro from '@/components/FreshCutsIntro';

// Evaluate the upcoming/past split per request so it reflects the current date,
// not the date the site was last built/deployed.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Fresh Cuts | The Birdhaus',
  description:
    'Fresh Cuts is The Birdhaus event series spotlighting brand-new material from Twin Cities artists — a recurring night built for first listens and fresh starts.',
};

// Fresh Cuts installments are numbered (v1, v2, ...) and always carry
// "fresh-cuts" in their slug, even when the title wraps it inside a larger
// event name (e.g. the Winter Shindig night that doubled as Fresh Cuts v7).
// Matching on the slug is the one reliable signal across every title style.
function isFreshCuts(slug: string) {
  return slug.toLowerCase().includes('fresh-cuts');
}

export default async function FreshCutsPage() {
  const [shows, content, isAdmin] = await Promise.all([
    getAllShows(),
    getFreshCutsContent(),
    isAdminSession(),
  ]);
  const today = getTodayCentral();

  const freshCuts = shows.filter((show) => isFreshCuts(show.slug));

  const upcoming = freshCuts
    .filter((show) => show.date >= today && show.announced === true)
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = freshCuts
    .filter((show) => show.date < today)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <FreshCutsIntro content={content} isAdmin={isAdmin} />

        {/* Upcoming installments */}
        {upcoming.length > 0 && (
          <section className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Next Up</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {upcoming.map((show) => (
                <ShowCard key={show.slug} show={show} />
              ))}
            </div>
          </section>
        )}

        {/* Past installments */}
        {past.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-6">
              <h2 className="text-2xl font-bold">Past Installments</h2>
              <span className="font-mono text-sm text-[#E8E0D0]/50">
                {past.length} nights
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {past.map((show) => (
                <ShowCard key={show.slug} show={show} />
              ))}
            </div>
          </section>
        )}

        {upcoming.length === 0 && past.length === 0 && (
          <p className="text-[#E8E0D0]/60">
            No Fresh Cuts shows on the books yet — check back soon.
          </p>
        )}
      </div>
    </main>
  );
}
