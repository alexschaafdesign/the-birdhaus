'use client';

import { useRouter } from 'next/navigation';

export default function PortalLogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/club/logout', { method: 'POST' }).catch(() => {});
    router.push('/');
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} className={className}>
      Log out
    </button>
  );
}
