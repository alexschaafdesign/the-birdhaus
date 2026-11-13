import { redirect } from 'next/navigation';

// Requests becomes the landing tab once it exists (Phase 4).
export default function RehearsalIndex() {
  redirect('/admin/rehearsal/settings');
}
