import { sql } from './db';
import { refreshSetupToken } from './club-members';
import { isBirdhausAccount } from './club-roles';
import { sendAccountPasswordResetEmail } from './account-email';
import { sendClubPasswordResetEmail } from './club-email';

// Emails a reset link for the non-disabled account behind `email`, if there is
// one. Crew/staff get the Birdhaus email (link to this site's /invite page);
// everyone else gets the Song Club one. Both forgot-password routes answer ok
// regardless, so this never reveals whether the address has an account.
export async function sendPasswordReset(email: string): Promise<void> {
  const [user] = await sql<Array<{ id: number }>>`
    select id from users
    where email = ${email} and status <> 'disabled'
  `;
  if (!user) return;
  const refreshed = await refreshSetupToken(Number(user.id), 'reset');
  if (!refreshed) return;
  const { member, token } = refreshed;
  const send = isBirdhausAccount(member.roles)
    ? sendAccountPasswordResetEmail
    : sendClubPasswordResetEmail;
  try {
    await send({ name: member.name, email, token });
  } catch (e) {
    console.error('[password-reset] reset email failed', e);
  }
}
