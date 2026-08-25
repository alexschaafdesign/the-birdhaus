'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const inputClass =
  'w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]';

// The shared-password operator login (Alex).
function OperatorForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError('Incorrect password.');
        setSubmitting(false);
        return;
      }
      router.push(searchParams.get('next') || '/admin');
      router.refresh();
    } catch {
      setError('Something went wrong — try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
      >
        {submitting ? 'Checking...' : 'Log in'}
      </button>
    </form>
  );
}

// Crew members log in with their own email + password (the same account the
// Song Club portal uses under the hood). The login route sends them to /admin.
function CrewForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/club/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Incorrect email or password.');
        setSubmitting(false);
        return;
      }
      router.push(data?.dest ?? '/admin');
      router.refresh();
    } catch {
      setError('Something went wrong — try again.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Email</label>
        <input
          type="email"
          autoFocus
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Password</label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
      >
        {submitting ? 'Checking...' : 'Log in'}
      </button>
    </form>
  );
}

function LoginPanel() {
  const [mode, setMode] = useState<'operator' | 'crew'>('operator');

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-4">Birdhaus Admin</h1>
        {mode === 'operator' ? <OperatorForm /> : <CrewForm />}
        <button
          type="button"
          onClick={() => setMode(mode === 'operator' ? 'crew' : 'operator')}
          className="mt-4 block text-xs text-[#E8E0D0]/50 underline-offset-2 transition hover:text-[#E8E0D0] hover:underline"
        >
          {mode === 'operator' ? 'Crew member? Log in with your email' : '← Back to password login'}
        </button>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginPanel />
    </Suspense>
  );
}
