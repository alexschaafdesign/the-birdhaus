'use client';

import { useState } from 'react';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import { parseAvailability, formatAvailabilityEntries, type AvailabilityEntry } from '@/lib/submissions';

const SHOW_REQUEST_URL = 'https://script.google.com/macros/s/AKfycbyh6Pw2VoQT7cu_Qt-6rwfRlP4xtcLhIx5jbFuzHOjhiW7mZgz-KqugsCHrgsOaVXeqSQ/exec';
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

type Tab = 'play' | 'contact';

export default function ContactPage() {
  const [activeTab, setActiveTab] = useState<Tab>('play');

  const [sr, setSr] = useState({ contactName: '', bandName: '', email: '', social: '', vibe: '', comments: '' });
  // Honeypot — hidden from real users; the API silently drops filled submissions.
  const [srWebsite, setSrWebsite] = useState('');
  const [srAvailability, setSrAvailability] = useState<AvailabilityEntry[]>([]);
  const [srStatus, setSrStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [srEmailError, setSrEmailError] = useState<string | null>(null);
  const [srDatesError, setSrDatesError] = useState<string | null>(null);

  const [ct, setCt] = useState({ name: '', email: '', message: '' });
  const [ctStatus, setCtStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [ctEmailError, setCtEmailError] = useState<string | null>(null);

  async function handleShowRequest(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmail(sr.email);
    if (error) { setSrEmailError(error); return; }
    setSrEmailError(null);

    if (srAvailability.length === 0) {
      setSrDatesError('Please add at least one date or date range.');
      return;
    }
    const availability = parseAvailability(srAvailability);
    if (!availability) {
      setSrDatesError('Please fill in every date field, or remove incomplete ones.');
      return;
    }
    setSrDatesError(null);
    setSrStatus('sending');

    // Backup copy in the Google Sheet — fire-and-forget, doesn't affect success/error state.
    fetch(SHOW_REQUEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'showrequest',
        ...sr,
        dates: formatAvailabilityEntries(availability),
      }).toString(),
    }).catch(() => {});

    try {
      const res = await fetch('/api/show-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sr, availability, website: srWebsite }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSrStatus('success');
    } catch {
      setSrStatus('error');
    }
  }

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
          Pick either "Show requests" or "General contact" and we'll get back to you as soon as possible! note: I'm just one dude doing this as an unpaid labor of love so your patience is appreciated :D
        </p>

        <div className="border border-[#E8E0D0]/30 rounded-lg p-4 mb-8 bg-[#E8E0D0]/5">
          <p className="text-sm">
            <span className="font-semibold">Heads up:</span> the BIRDHAUS will be closed for shows from October through December 2026.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-[#E8E0D0]/20">
          {([['play', 'Show requests'], ['contact', 'General contact']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-b-2 border-[#E8E0D0] text-[#E8E0D0]'
                  : 'text-[#E8E0D0]/40 hover:text-[#E8E0D0]/70'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Show Request Form */}
        {activeTab === 'play' && (
          <>
            {srStatus === 'success' ? (
              <p className="text-lg">Thanks for reaching out! We'll get back to you as soon as we can.</p>
            ) : (
              <form onSubmit={handleShowRequest} className="space-y-5">
                {/* Honeypot: off-screen, not focusable, hidden from assistive tech. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
                  <label htmlFor="sr-website">Website</label>
                  <input
                    type="text"
                    id="sr-website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={srWebsite}
                    onChange={e => setSrWebsite(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Your name</label>
                  <input
                    type="text"
                    required
                    value={sr.contactName}
                    onChange={e => setSr(p => ({ ...p, contactName: e.target.value }))}
                    className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Your email</label>
                  <input
                    type="email"
                    required
                    value={sr.email}
                    onChange={e => {
                      setSr(p => ({ ...p, email: e.target.value }));
                      if (srEmailError) setSrEmailError(null);
                    }}
                    onBlur={e => {
                      if (e.target.value.trim()) setSrEmailError(validateEmail(e.target.value));
                    }}
                    aria-invalid={srEmailError ? true : undefined}
                    className={`w-full bg-transparent border rounded px-4 py-2 focus:outline-none transition-colors ${
                      srEmailError ? 'border-red-500 focus:border-red-500' : 'border-[#E8E0D0]/30 focus:border-[#E8E0D0]'
                    }`}
                  />
                  {srEmailError && <p className="mt-1 text-sm text-red-400">{srEmailError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Band / artist name</label>
                  <input
                    type="text"
                    required
                    value={sr.bandName}
                    onChange={e => setSr(p => ({ ...p, bandName: e.target.value }))}
                    className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Instagram, website, or social</label>
                  <input
                    type="text"
                    value={sr.social}
                    onChange={e => setSr(p => ({ ...p, social: e.target.value }))}
                    placeholder="@handle or URL"
                    className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Genre / what's your vibe</label>
                  <input
                    type="text"
                    value={sr.vibe}
                    onChange={e => setSr(p => ({ ...p, vibe: e.target.value }))}
                    placeholder="e.g. dreamy punk, ambient country, chaotic jazz..."
                    className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Dates you're looking for</label>
                  <p className="text-sm text-[#E8E0D0]/50 mb-2">
                    Add as many specific dates or date ranges as needed.
                  </p>
                  <AvailabilityPicker
                    entries={srAvailability}
                    onChange={(next) => {
                      setSrAvailability(next);
                      if (srDatesError) setSrDatesError(null);
                    }}
                    inputClassName="bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-2 focus:outline-none focus:border-[#E8E0D0] w-40"
                    size="md"
                  />
                  {srDatesError && <p className="mt-2 text-sm text-red-400">{srDatesError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Anything else</label>
                  <textarea
                    rows={4}
                    value={sr.comments}
                    onChange={e => setSr(p => ({ ...p, comments: e.target.value }))}
                    placeholder="Specific needs or dreams etc!"
                    className="w-full bg-transparent border border-[#E8E0D0]/30 rounded px-4 py-2 focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30 resize-none"
                  />
                </div>
                {srStatus === 'error' && (
                  <p className="text-red-400 text-sm">Something went wrong — try emailing us directly at alex@thebirdhaus.org</p>
                )}
                <button
                  type="submit"
                  disabled={srStatus === 'sending'}
                  className="border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0] hover:text-[#2A2420] transition-colors disabled:opacity-50"
                >
                  {srStatus === 'sending' ? 'Sending...' : 'Submit'}
                </button>
              </form>
            )}
          </>
        )}

        {/* Contact Form */}
        {activeTab === 'contact' && (
          <>
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
          </>
        )}
      </div>
    </main>
  );
}