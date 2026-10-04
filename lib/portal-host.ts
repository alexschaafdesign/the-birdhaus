import { headers } from 'next/headers';
import { isPortalHost } from './site';

// Server-only: is this request on the portal host? Needed where one route
// renders on both hosts (the root layout, /login, /account). Portal-only
// routes can key off PORTAL_SPLIT instead — with the split on, the main host
// redirects them away.
export async function onPortalHost(): Promise<boolean> {
  return isPortalHost((await headers()).get('host'));
}
