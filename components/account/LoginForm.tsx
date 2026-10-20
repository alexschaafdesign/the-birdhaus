'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FORM } from '@/components/night/form';

// Birdhaus login (crew, staff, photographers), with an inline "forgot
// password" mode that swaps the password field for a send-reset-email action.
// A former Song Club member who signs in here gets a link to Songhaus instead
// of a session.
export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Wrong credentials mark both fields (the server doesn't say which was
  // wrong); other errors (rate limit, network) are about the whole form.
  const [invalid, setInvalid] = useState<'credentials' | null>(null);
  const [movedTo, setMovedTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInvalid(null);
    setMovedTo(null);
    setNotice(null);
    try {
      if (mode === 'forgot') {
        const res = await fetch('/api/account/forgot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
        setNotice('If that address has an account, a reset link is on its way.');
      } else {
        const res = await fetch('/api/account/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => null);
        if (typeof data?.movedTo === 'string') setMovedTo(data.movedTo);
        else if (res.status === 401) setInvalid('credentials');
        if (!res.ok) throw new Error(data?.error ?? `Something went wrong (${res.status})`);
        router.push(typeof data?.dest === 'string' ? data.dest : '/admin');
        router.refresh();
        return; // keep the button disabled through the redirect
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="login-email" className={FORM.label}>
          Email
        </label>
        <input
          type="email"
          id="login-email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={invalid === 'credentials' ? true : undefined}
          aria-describedby={invalid === 'credentials' ? 'login-error' : undefined}
          className={invalid === 'credentials' ? FORM.fieldInvalid : FORM.field}
        />
      </div>

      {mode === 'login' && (
        <div>
          <label htmlFor="login-password" className={FORM.label}>
            Password
          </label>
          <input
            type="password"
            id="login-password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={invalid === 'credentials' ? true : undefined}
            aria-describedby={invalid === 'credentials' ? 'login-error' : undefined}
            className={invalid === 'credentials' ? FORM.fieldInvalid : FORM.field}
          />
        </div>
      )}

      {error && (
        <p id="login-error" className={FORM.error} role="alert">
          {error}
          {movedTo && (
            <>
              {' '}
              <a href={movedTo} className={`${FORM.link} font-bold`}>
                Log in on Songhaus →
              </a>
            </>
          )}
        </p>
      )}
      {notice && (
        <div className={FORM.notice} role="status">
          {notice}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className={FORM.primary}
      >
        {busy ? 'One sec…' : mode === 'forgot' ? 'Email me a reset link' : 'Log in'}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'forgot' : 'login');
          setError(null);
          setInvalid(null);
          setNotice(null);
        }}
        className={`${FORM.link} text-body-3 w-fit`}
      >
        {mode === 'login' ? 'Forgot password?' : '← Back to log in'}
      </button>
    </form>
  );
}
