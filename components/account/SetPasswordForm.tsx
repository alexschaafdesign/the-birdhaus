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
  // The field the error is about: shown under it, with a red border. null =
  // a server error, shown above the button.
  const [errorField, setErrorField] = useState<'password' | 'confirm' | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      setErrorField('password');
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      setErrorField('confirm');
      return;
    }
    setBusy(true);
    setError(null);
    setErrorField(null);
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
          aria-invalid={errorField === 'password' ? true : undefined}
          aria-describedby={errorField === 'password' ? 'set-password-error' : undefined}
          className={errorField === 'password' ? FORM.fieldInvalid : FORM.field}
        />
        {error && errorField === 'password' && (
          <p id="set-password-error" className={FORM.fieldError} role="alert">
            {error}
          </p>
        )}
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
          aria-invalid={errorField === 'confirm' ? true : undefined}
          aria-describedby={errorField === 'confirm' ? 'set-password-error' : undefined}
          className={errorField === 'confirm' ? FORM.fieldInvalid : FORM.field}
        />
        {error && errorField === 'confirm' && (
          <p id="set-password-error" className={FORM.fieldError} role="alert">
            {error}
          </p>
        )}
      </div>

      {error && !errorField && (
        <p className={FORM.error} role="alert">
          {error}
        </p>
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
