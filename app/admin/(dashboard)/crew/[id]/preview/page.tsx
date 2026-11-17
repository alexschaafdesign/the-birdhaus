import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getMemberById } from '@/lib/accounts/members';
import { getPhotographerByUserId } from '@/lib/photographers';
import CrewHome from '@/components/admin/CrewHome';
import { ADMIN_TYPE } from '@/components/admin/ui';

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
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-8">
        <div
          role="status"
          className={`${ADMIN_TYPE.body} bg-surface-ink text-surface-paper flex flex-wrap items-center justify-between gap-3 px-4 py-2`}
        >
          <span>
            Read-only preview of <span className="font-bold">{member.name}</span>&apos;s home.
          </span>
          <span className="flex items-center gap-4">
            {photographer && (
              <Link
                href={`/admin/photographers/${photographer.id}`}
                className="hover:text-accent-brick underline underline-offset-4"
              >
                Edit their profile
              </Link>
            )}
            <Link href="/admin/crew" className="hover:text-accent-brick underline underline-offset-4">
              Back to crew
            </Link>
          </span>
        </div>
      </div>
      <CrewHome member={member} preview />
    </div>
  );
}
