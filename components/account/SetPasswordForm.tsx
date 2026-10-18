'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORM } from '@/components/night/form';

const MIN_LENGTH = 8; // mirrors MIN_PASSWORD_LENGTH in lib/accounts/auth.ts

// Sets the password for a crew invite or reset token; the API logs them in
// on success and they land in /admin.
export default function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
      router.push(typeof data?.dest === 'string' ? data.dest : '/admin');
      router.refresh();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="account-new-password" className={FORM.label}>
          Password
        </label>
        <input
          type="password"
          id="account-new-password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FORM.field}
        />
      </div>
      <div>
        <label htmlFor="account-confirm-password" className={FORM.label}>
          Confirm password
        </label>
        <input
          type="password"
          id="account-confirm-password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={FORM.field}
        />
      </div>

      {error && (
        <div className={FORM.error} role="alert">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className={FORM.primary}
      >
        {busy ? 'Joining…' : 'Set password & enter'}
      </button>
    </form>
  );
}
