import { redirect } from 'next/navigation';

// The old flat show list predated /upcoming and /archive and had no
// announced/date filtering, so it exposed unannounced drafts. Everything it
// showed lives on those two pages now.
export default function ShowsPage() {
  redirect('/upcoming');
}
