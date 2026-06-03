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

export default function RSVPForm({
  showTitle, 
  showDate,
  doorsTime,
  showTime,
  flyerUrl,
  ticketUrl
}: { 
  showTitle: string;
  showDate: string;
  doorsTime?: string;
  showTime?: string;
  flyerUrl?: string;
  ticketUrl?: string;
}) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    guests: '1',
    emailList: false,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const error = validateEmail(formData.email);
    if (error) {
      setEmailError(error);
      return;
    }
    setEmailError(null);

    setStatus('submitting');

    try {
      const response = await fetch('https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          show: showTitle,
          date: showDate,
          doorsTime: doorsTime || '',
          showTime: showTime || '',
          flyerUrl: flyerUrl || '',
          name: formData.name,
          email: formData.email,
          guests: formData.guests,
          emailList: formData.emailList.toString(),
        }).toString(),
      });

      setStatus('success');
      setFormData({ name: '', email: '', guests: '1', emailList: false });
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <div className="border-2 border-[#E8E0D0]/20 rounded-lg p-8 mb-12 bg-[#E8E0D0]/5">
      <h2 className="text-3xl font-bold mb-2">RSVP for this show</h2>
      <p className="text-[#E8E0D0]/70 mb-6">
        RSVP below to get the venue address and show details emailed to you.
        {ticketUrl && (
          <> After submitting, you'll have the option to <strong>buy an advance ticket</strong> to guarantee your spot.</>
        )}
      </p>

      {status === 'success' ? (
        <div className="space-y-4">
          <div className="bg-green-900/30 border-2 border-green-500 rounded-lg p-4 text-green-300">
            Thanks for your RSVP! Check your email for the full details.
          </div>
          {ticketUrl && (
            <div className="bg-[#E8E0D0] text-[#2A2420] rounded-lg p-6">
              <p className="text-lg font-bold mb-1">🎟 Want to guarantee your spot?</p>
              <p className="text-[#2A2420]/70 text-sm mb-5">
                RSVPs are first-come, first-served and the venue is small. Buying an advance ticket means you're in — no matter how packed it gets.
              </p>
              <a
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#2A2420] text-[#E8E0D0] font-bold py-3 px-6 rounded-lg hover:bg-[#2A2420]/80 transition-colors"
              >
                Buy a Ticket →
              </a>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2 text-[#E8E0D0]/80">
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-[#2A2420] border-2 border-[#E8E0D0]/30 rounded-lg px-4 py-3 text-[#E8E0D0] focus:border-[#E8E0D0] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2 text-[#E8E0D0]/80">
              Email
            </label>
            <input
              type="email"
              id="email"
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
              className={`w-full bg-[#2A2420] border-2 rounded-lg px-4 py-3 text-[#E8E0D0] focus:outline-none transition-colors ${
                emailError ? 'border-red-500 focus:border-red-500' : 'border-[#E8E0D0]/30 focus:border-[#E8E0D0]'
              }`}
            />
            {emailError && (
              <p className="mt-2 text-sm text-red-400">{emailError}</p>
            )}
          </div>

          <div>
            <label htmlFor="guests" className="block text-sm font-medium mb-2 text-[#E8E0D0]/80">
              Number of guests (including you)
            </label>
            <select
              id="guests"
              value={formData.guests}
              onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
              className="w-full bg-[#2A2420] border-2 border-[#E8E0D0]/30 rounded-lg px-4 py-3 text-[#E8E0D0] focus:border-[#E8E0D0] focus:outline-none transition-colors"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5+</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="emailList"
              checked={formData.emailList}
              onChange={(e) => setFormData({ ...formData, emailList: e.target.checked })}
              className="w-5 h-5 rounded border-2 border-[#E8E0D0]/30 text-[#E8E0D0] focus:ring-[#E8E0D0]"
            />
            <label htmlFor="emailList" className="text-sm text-[#E8E0D0]/80">
              Add me to the email list for future shows
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-[#E8E0D0] text-[#2A2420] font-bold py-4 px-6 rounded-lg hover:bg-[#E8E0D0]/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit RSVP'}
          </button>

          {status === 'error' && (
            <div className="bg-red-900/30 border-2 border-red-500 rounded-lg p-4 text-red-300">
              Something went wrong. Please try again.
            </div>
          )}
        </form>
      )}
    </div>
  );
}