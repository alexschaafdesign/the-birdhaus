import { sql } from '../db';
import { refreshSetupToken } from './members';
import { isBirdhausAccount } from './roles';
import { sendAccountPasswordResetEmail } from './email';

// Emails a reset link for the non-disabled crew/staff account behind `email`,
// if there is one (link to this site's /invite page). Song Club members reset
// their password on Songhaus, so nothing is sent for them here. The
// forgot-password routes answer ok regardless, so this never reveals whether
// the address has an account.
export async function sendPasswordReset(email: string): Promise<void> {
  const [user] = await sql<Array<{ id: number; roles: string[] }>>`
    select id,
           (select coalesce(array_agg(r.role), '{}') from user_roles r where r.user_id = users.id) as roles
    from users
    where email = ${email} and status <> 'disabled'
  `;
  if (!user || !isBirdhausAccount(user.roles as Parameters<typeof isBirdhausAccount>[0])) return;
  const refreshed = await refreshSetupToken(Number(user.id), 'reset');
  if (!refreshed) return;
  const { member, token } = refreshed;
  try {
    await sendAccountPasswordResetEmail({ name: member.name, email, token });
  } catch (e) {
    console.error('[password-reset] reset email failed', e);
  }
}
