import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getMemberById } from '@/lib/club-members';
import { getPhotographerByUserId } from '@/lib/photographers';
import CrewHome from '@/components/admin/CrewHome';

export const dynamic = 'force-dynamic';

// Admin-only, read-only preview of a crew member's personalized home — so Alex
// can see exactly what they see. Gated to admins by proxy.ts (/admin/*). The
// dashboard renders their real data with actions disabled (see CrewHome's
// `preview` prop). To actually edit a photographer's profile, use the linked
// photographer admin page (linked in the banner).
export default async function CrewHomePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isInteger(memberId)) notFound();

  const member = await getMemberById(memberId);
  if (!member || !member.roles.includes('crew')) notFound();

  const photographer = await getPhotographerByUserId(member.id);

  return (
    <div>
      <div className="mx-auto max-w-3xl px-6 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.05] px-4 py-2 text-sm text-[#E8E0D0]/70">
          <span>
            Read-only preview of <span className="font-medium text-[#E8E0D0]">{member.name}</span>&apos;s
            home.
          </span>
          <span className="flex items-center gap-4">
            {photographer && (
              <Link
                href={`/admin/photographers/${photographer.id}`}
                className="underline hover:text-[#E8E0D0]"
              >
                Edit their profile
              </Link>
            )}
            <Link href="/admin/crew" className="underline hover:text-[#E8E0D0]">
              Back to crew
            </Link>
          </span>
        </div>
      </div>
      <CrewHome member={member} preview />
    </div>
  );
}
