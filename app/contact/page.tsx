'use client';

import { useState } from 'react';

const CONTACT_URL = 'https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec';

// Basic RFC-ish format check.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common typo TLDs -> the TLD the user almost certainly meant.
const TLD_TYPOS: Record<string, string> = {
  con: 'com', cpm: 'com', ocm: 'com', cmo: 'com', comm: 'com',
  co: 'com', vom: 'com', xom: 'com', nett: 'net', ne: 'net',
  orgg: 'org', ogr: 'org', rog: 'org', edi: 'edu',
};

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

export default function ContactPage() {
  const [ct, setCt] = useState({ name: '', email: '', message: '' });
  const [ctStatus, setCtStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [ctEmailError, setCtEmailError] = useState<string | null>(null);

  async function handleContact(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmail(ct.email);
    if (error) { setCtEmailError(error); return; }
    setCtEmailError(null);
    setCtStatus('sending');
    try {
      await fetch(CONTACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'contact', ...ct }).toString(),
      });
      setCtStatus('success');
      setCt({ name: '', email: '', message: '' });
    } catch {
      setCtStatus('error');
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-xl mx-auto px-8 pb-16">
        <div className="vhs-stripes h-1.5 w-24 mb-3" aria-hidden="true" />
        <h2 className="text-4xl font-bold mb-2 uppercase tracking-tight">Contact</h2>
        <p className="text-ink/70 text-base mb-6">
          Send us a message and we'll get back to you as soon as possible! note: I'm just one dude doing this as an unpaid labor of love so your patience is appreciated :D
        </p>

        <div className="border-2 border-ink p-4 mb-8 bg-paper-deep">
          <p className="text-sm">
            <span className="font-semibold">Heads up:</span> we are fully booked for the rest of the 2026 season (we'll be closed October-December), but feel free to send a message to get on our radar for 2027!
          </p>
        </div>

        {ctStatus === 'success' ? (
          <p className="text-base">Thanks for reaching out! We'll get back to you as soon as we can.</p>
        ) : (
          <form onSubmit={handleContact} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                required
                value={ct.name}
                onChange={e => setCt(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-paper border-2 border-ink/40 px-4 py-2 focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={ct.email}
                onChange={e => {
                  setCt(p => ({ ...p, email: e.target.value }));
                  if (ctEmailError) setCtEmailError(null);
                }}
                onBlur={e => {
                  if (e.target.value.trim()) setCtEmailError(validateEmail(e.target.value));
                }}
                aria-invalid={ctEmailError ? true : undefined}
                className={`w-full bg-paper border-2 px-4 py-2 focus:outline-none transition-colors ${
                  ctEmailError ? 'border-vhs-red focus:border-vhs-red' : 'border-ink/40 focus:border-ink'
                }`}
              />
              {ctEmailError && <p className="mt-1 text-sm text-vhs-red">{ctEmailError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                required
                rows={5}
                value={ct.message}
                onChange={e => setCt(p => ({ ...p, message: e.target.value }))}
                className="w-full bg-paper border-2 border-ink/40 px-4 py-2 focus:outline-none focus:border-ink resize-none"
              />
            </div>
            {ctStatus === 'error' && (
              <p className="text-vhs-red text-sm">Something went wrong — try emailing us directly at alex@thebirdhaus.org</p>
            )}
            <button
              type="submit"
              disabled={ctStatus === 'sending'}
              className="border-2 border-ink px-6 py-2 text-sm font-medium hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
            >
              {ctStatus === 'sending' ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
