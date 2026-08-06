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
        <h2 className="text-4xl font-bold mb-2">Contact</h2>
        <p className="text-[#E8E0D0]/70 text-lg mb-6">
          Send us a message and we'll get back to you as soon as possible! note: I'm just one dude doing this as an unpaid labor of love so your patience is appreciated :D
        </p>

        <div className="border border-[#E8E0D0]/30 rounded-lg p-4 mb-8 bg-[#E8E0D0]/5">
          <p className="text-sm">
            <span className="font-semibold">Heads up:</span> we are fully booked for the rest of the 2026 season (we'll be closed October-December), but feel free to send a message to get on our radar for 2027!
          </p>
        </div>

        {ctStatus === 'success' ? (
          <p className="text-lg">Thanks for reaching out! We'll get back to you as soon as we can.</p>
        ) : (
          <form onSubmit={handleContact} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                required
                value={ct.name}
                onChange={e => setCt(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]"
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
                className={`w-full bg-transparent border rounded px-4 py-2 focus:outline-none transition-colors ${
                  ctEmailError ? 'border-red-500 focus:border-red-500' : 'border-[#E8E0D0]/30 focus:border-[#E8E0D0]'
                }`}
              />
              {ctEmailError && <p className="mt-1 text-sm text-red-400">{ctEmailError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Message</label>
              <textarea
                required
                rows={5}
                value={ct.message}
                onChange={e => setCt(p => ({ ...p, message: e.target.value }))}
                className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0] resize-none"
              />
            </div>
            {ctStatus === 'error' && (
              <p className="text-red-400 text-sm">Something went wrong — try emailing us directly at alex@thebirdhaus.org</p>
            )}
            <button
              type="submit"
              disabled={ctStatus === 'sending'}
              className="border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
            >
              {ctStatus === 'sending' ? 'Sending...' : 'Send'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
