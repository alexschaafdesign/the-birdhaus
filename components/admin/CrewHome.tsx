import type { UserAccount } from '@/lib/accounts/members';
import {
  getPhotographerByUserId,
  getPhotographerQueue,
  photographerSlug,
} from '@/lib/photographers';
import SoundCoverageWidget from './SoundCoverageWidget';
import PhotographerDashboard from './PhotographerDashboard';
import { PageHeader, Panel, ADMIN_TYPE } from './ui';

// A crew member's personalized admin landing page. Greets them by title and
// renders a widget for each assigned focus area, plus a photographer dashboard
// if their login is linked to a photographer profile. They still have the full
// admin sidebar beside it — this just puts their job front and center.
export default async function CrewHome({
  member,
  preview = false,
}: {
  member: UserAccount;
  // Admin preview render — disables the interactive controls (they'd act as the
  // logged-in admin, not this member).
  preview?: boolean;
}) {
  const focus = member.focus_areas;

  // The photographer dashboard is driven by the photographers.user_id link, not
  // a focus area, so it appears for any crew member connected to a profile.
  const photographer = await getPhotographerByUserId(member.id);
  const queue = photographer ? await getPhotographerQueue(photographer.id) : [];

  const hasContent = focus.length > 0 || Boolean(photographer);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader overline="Your home" title={member.name} description={member.title ?? undefined} />

      {!hasContent ? (
        <Panel>
          <p className={`${ADMIN_TYPE.body} ${ADMIN_TYPE.muted}`}>
            No focus areas set up yet. You have full admin access — use the menu
            to get around. Ask Alex to point your dashboard at what you&apos;re
            looking after.
          </p>
        </Panel>
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
              readOnly={preview}
            />
          )}
        </div>
      )}
    </main>
  );
}
