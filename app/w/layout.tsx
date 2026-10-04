import { portalMetadata } from '@/lib/portal-metadata';

export const metadata = portalMetadata('/');

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
