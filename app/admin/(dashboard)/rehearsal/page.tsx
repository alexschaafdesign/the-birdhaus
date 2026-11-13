import { redirect } from 'next/navigation';

// Requests is the landing tab.
export default function RehearsalIndex() {
  redirect('/admin/rehearsal/requests');
}
