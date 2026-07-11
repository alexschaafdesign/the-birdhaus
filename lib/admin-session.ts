import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// Split from lib/auth.ts so next/headers (Node/Server-Components-only) doesn't
// get pulled into proxy.ts's Edge middleware bundle.
export async function isAdminSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
