import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isAdminSession } from '@/lib/admin-session';

// /redesign/components and /redesign/tokens: design-system preview surfaces for
// staff. Everyone else gets a 404, so they aren't public pages. (The icons
// under public/redesign are static files and don't pass through here.)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function RedesignLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminSession())) notFound();
  return children;
}
