import type { ClubMember } from '@/lib/club-members';
import {
  getPhotographerByUserId,
  getPhotographerQueue,
  photographerSlug,
} from '@/lib/photographers';
import SoundCoverageWidget from './SoundCoverageWidget';
import PhotographerDashboard from './PhotographerDashboard';

// A crew member's personalized admin landing page. Greets them by title and
// renders a widget for each assigned focus area, plus a photographer dashboard
// if their login is linked to a photographer profile. They still have the full
// admin nav above — this just puts their job front and center.
export default async function CrewHome({ member }: { member: ClubMember }) {
  const focus = member.focus_areas;

  // The photographer dashboard is driven by the photographers.user_id link, not
  // a focus area, so it appears for any crew member connected to a profile.
  const photographer = await getPhotographerByUserId(member.id);
  const queue = photographer ? await getPhotographerQueue(photographer.id) : [];

  const hasContent = focus.length > 0 || Boolean(photographer);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8 text-[#E8E0D0]">
      <header className="mb-8">
        <h2 className="text-2xl font-semibold">{member.name}</h2>
        {member.title && <p className="mt-1 text-sm text-[#E8E0D0]/55">{member.title}</p>}
      </header>

      {!hasContent ? (
        <p className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 text-sm text-[#E8E0D0]/60">
          No focus areas set up yet. You have full admin access — use the nav
          above to get around. Ask Alex to point your dashboard at what
          you&apos;re looking after.
        </p>
      ) : (
        <div className="space-y-8">
          {focus.includes('sound_coverage') && <SoundCoverageWidget />}
          {photographer && (
            <PhotographerDashboard
              name={photographer.name}
              profileHref={`/photos/${photographerSlug(photographer.name)}`}
              initialPhoto={photographer.photo}
              initialInstagram={photographer.instagram}
              initialBio={photographer.bio}
              queue={queue}
            />
          )}
        </div>
      )}
    </main>
  );
}
