'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const MIN_LENGTH = 8; // mirrors MIN_PASSWORD_LENGTH in lib/club-auth.ts

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// Sets the password for an invite/reset token and drops the member straight
// into the portal (the API logs them in on success).
export default function ClubSetPasswordForm({ token }: { token: string }) {
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
      const res = await fetch(`/api/club/invite/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
      router.push('/song-club');
      router.refresh();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="club-new-password" className={labelClass}>
          Password
        </label>
        <input
          type="password"
          id="club-new-password"
          required
          minLength={MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputBase}
        />
      </div>
      <div>
        <label htmlFor="club-confirm-password" className={labelClass}>
          Confirm password
        </label>
        <input
          type="password"
          id="club-confirm-password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputBase}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-[#E8E0D0] px-6 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Joining…' : 'Set password & enter'}
      </button>
    </form>
  );
}
