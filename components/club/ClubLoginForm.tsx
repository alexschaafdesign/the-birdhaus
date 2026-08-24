'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const inputBase =
  'w-full rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03] px-3 py-2 text-sm text-[#E8E0D0] placeholder:text-[#E8E0D0]/30 focus:border-[#E8E0D0]/50 focus:outline-none transition';
const labelClass = 'mb-1 block text-xs font-medium uppercase tracking-wide text-[#E8E0D0]/55';

// Member login for the Song Club portal, with an inline "forgot password"
// mode that swaps the password field for a send-reset-email action.
export default function ClubLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/club/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
        setNotice('If that address has an account, a reset link is on its way.');
      } else {
        const res = await fetch('/api/club/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
        router.push('/song-club');
        router.refresh();
        return; // keep the button disabled through the redirect
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label htmlFor="club-email" className={labelClass}>
          Email
        </label>
        <input
          type="email"
          id="club-email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputBase}
        />
      </div>

      {mode === 'login' && (
        <div>
          <label htmlFor="club-password" className={labelClass}>
            Password
          </label>
          <input
            type="password"
            id="club-password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputBase}
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#F5A3A3]/40 bg-[#F5A3A3]/10 p-3 text-sm text-[#F5A3A3]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-[#7bb98a]/40 bg-[#7bb98a]/10 p-3 text-sm text-[#bfe6c8]">
          {notice}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-[#E8E0D0] px-6 py-2.5 text-sm font-semibold text-[#2A2420] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'One sec…' : mode === 'forgot' ? 'Email me a reset link' : 'Log in'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'forgot' : 'login');
          setError(null);
          setNotice(null);
        }}
        className="block text-xs text-[#E8E0D0]/50 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
      >
        {mode === 'login' ? 'Forgot password?' : '← Back to log in'}
      </button>
    </form>
  );
}
