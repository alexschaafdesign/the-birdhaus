'use client';

import { useState } from 'react';

// Basic RFC-ish format check.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common typo TLDs -> the TLD the user almost certainly meant.
const TLD_TYPOS: Record<string, string> = {
  con: 'com',
  cpm: 'com',
  ocm: 'com',
  cmo: 'com',
  comm: 'com',
  co: 'com',
  vom: 'com',
  xom: 'com',
  nett: 'net',
  ne: 'net',
  orgg: 'org',
  ogr: 'org',
  rog: 'org',
  edi: 'edu',
};

// Returns an error message if the email is invalid, otherwise null.
function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!EMAIL_REGEX.test(trimmed)) {
    return 'Please enter a valid email address.';
  }
  const tld = trimmed.split('.').pop()?.toLowerCase() ?? '';
  if (TLD_TYPOS[tld]) {
    const suggested = trimmed.replace(new RegExp(`\\.${tld}$`, 'i'), `.${TLD_TYPOS[tld]}`);
    return `Did you mean "${suggested}"?`;
  }
  return null;
}

const inputBase =
  'w-full border-2 bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none transition';
const labelClass = 'mb-1 block font-mono text-xs font-medium uppercase tracking-wide text-ink/55';

// Public RSVP form for a Song Club event. Posts to /api/song-club/rsvp, which
// re-fetches the event server-side and emails the address + details.
export default function SongClubRSVPForm({ eventId }: { eventId: number }) {
  const [formData, setFormData] = useState({ name: '', email: '', guests: '1' });
  // Honeypot — hidden from real users, only bots fill it. The server silently
  // drops any submission that has it set.
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const error = validateEmail(formData.email);
    if (error) {
      setEmailError(error);
      return;
    }
    setEmailError(null);
    setStatus('submitting');

    try {
      const response = await fetch('/api/song-club/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          name: formData.name,
          email: formData.email,
          guests: formData.guests,
          website,
        }),
      });
      if (!response.ok) throw new Error('RSVP submission failed');
      setStatus('success');
      setFormData({ name: '', email: '', guests: '1' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="border-2 border-vhs-green p-4 text-sm text-vhs-green">
        Thanks for your RSVP! Check your email for the address and full details.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Honeypot: off-screen, not focusable, hidden from assistive tech. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="website">Website</label>
        <input
          type="text"
          id="website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="rsvp-name" className={labelClass}>
          Name
        </label>
        <input
          type="text"
          id="rsvp-name"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className={`${inputBase} border-ink/40 focus:border-ink`}
        />
      </div>

      <div>
        <label htmlFor="rsvp-email" className={labelClass}>
          Email
        </label>
        <input
          type="email"
          id="rsvp-email"
          required
          value={formData.email}
          onChange={(e) => {
            setFormData({ ...formData, email: e.target.value });
            if (emailError) setEmailError(null);
          }}
          onBlur={(e) => {
            if (e.target.value.trim()) setEmailError(validateEmail(e.target.value));
          }}
          aria-invalid={emailError ? true : undefined}
          className={`${inputBase} ${
            emailError ? 'border-vhs-red focus:border-vhs-red' : 'border-ink/40 focus:border-ink'
          }`}
        />
        {emailError && <p className="mt-1 text-sm text-vhs-red">{emailError}</p>}
      </div>

      <div>
        <label htmlFor="rsvp-guests" className={labelClass}>
          Number of guests (including you)
        </label>
        <select
          id="rsvp-guests"
          value={formData.guests}
          onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
          className={`${inputBase} border-ink/40 focus:border-ink`}
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
          <option value="5">5+</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full bg-ink px-6 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit RSVP'}
      </button>

      {status === 'error' && (
        <div className="border-2 border-vhs-red p-4 text-sm text-vhs-red">
          Something went wrong. Please try again.
        </div>
      )}
    </form>
  );
}
