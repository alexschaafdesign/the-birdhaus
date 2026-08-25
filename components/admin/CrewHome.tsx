import { splitName } from '@/lib/name';
import type { ClubMember } from '@/lib/club-members';
import SoundCoverageWidget from './SoundCoverageWidget';

// A crew member's personalized admin landing page. Greets them by title and
// renders a widget for each assigned focus area. They still have the full admin
// nav above — this just puts their job front and center.
export default async function CrewHome({ member }: { member: ClubMember }) {
  const firstName = splitName(member.name).firstName || member.name;
  const focus = member.focus_areas;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8 text-[#E8E0D0]">
      <header className="mb-8">
        <h2 className="text-2xl font-semibold">Hey {firstName}</h2>
        {member.title && <p className="mt-1 text-sm text-[#E8E0D0]/55">{member.title}</p>}
      </header>

      {focus.length === 0 ? (
        <p className="rounded-lg border border-[#E8E0D0]/15 bg-[#E8E0D0]/[0.03] p-4 text-sm text-[#E8E0D0]/60">
          No focus areas set up yet. You have full admin access — use the nav
          above to get around. Ask Alex to point your dashboard at what
          you&apos;re looking after.
        </p>
      ) : (
        <div className="space-y-8">
          {focus.includes('sound_coverage') && <SoundCoverageWidget />}
        </div>
      )}
    </main>
  );
}
