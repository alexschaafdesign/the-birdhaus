import { redirect } from 'next/navigation';

// Monica Marie is a workspace (migration 091 tenancy). Like /yellow-ostrich,
// this vanity path lets old links and muscle memory land on the real route.
export default function MonicaMarieRedirect() {
  redirect('/w/monica-marie');
}
