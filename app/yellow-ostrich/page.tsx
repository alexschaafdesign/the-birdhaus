import { redirect } from 'next/navigation';

// Yellow Ostrich became the first workspace when the song pile went
// multi-tenant (migration 091). Old links and muscle memory land here.
export default function YellowOstrichRedirect() {
  redirect('/w/yellow-ostrich');
}
