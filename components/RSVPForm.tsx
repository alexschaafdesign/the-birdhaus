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

// Class sets per look. 'legacy' is the paper/VHS site (and the Song Club
// portal); '2027' is the DS look for /shows/[id]: CommitMono, tokens, square
// corners, no shadows. Markup and behaviour are shared — only classes differ.
const LOOKS = {
  legacy: {
    panel: 'h-full overflow-y-auto border-2 border-ink bg-paper-deep p-4 shadow-hard',
    title: 'text-base font-bold mb-1.5',
    intro: 'text-sm text-ink/70 mb-4',
    success: 'border-2 border-vhs-green bg-paper p-4 text-vhs-green',
    upsell: 'bg-ink text-paper p-5',
    upsellTitle: 'font-bold mb-1',
    upsellText: 'text-paper/70 text-sm mb-4',
    upsellButton: 'inline-block bg-paper text-ink font-bold py-2.5 px-5 hover:bg-paper/80 transition-colors text-sm',
    label: 'block text-sm font-medium mb-1 text-ink/80',
    input: 'w-full bg-paper border-2 border-ink/40 px-3 py-1.5 placeholder:text-ink/40 focus:border-ink focus:outline-none transition-colors',
    inputBase: 'w-full bg-paper border-2 px-3 py-1.5 placeholder:text-ink/40 focus:outline-none transition-colors',
    inputOk: 'border-ink/40 focus:border-ink',
    inputBad: 'border-vhs-red focus:border-vhs-red',
    fieldError: 'mt-1.5 text-sm text-vhs-red',
    checkbox: 'w-4 h-4 border-2 border-ink/40 accent-ink focus:ring-ink',
    checkLabel: 'text-sm text-ink/80',
    submit: 'w-full bg-ink text-paper font-bold py-2.5 px-6 hover:bg-ink/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
    error: 'border-2 border-vhs-red bg-paper p-4 text-vhs-red',
  },
  '2027': {
    panel: 'border-surface-ink flex flex-col border-2 p-4 sm:p-6',
    title: 'text-header-4 mb-2 font-bold uppercase leading-[1.2]',
    intro: 'text-body-3 mb-5 leading-normal',
    success: 'border-surface-ink text-body-3 border-2 p-4 leading-normal',
    upsell: 'bg-surface-ink text-surface-paper p-5',
    upsellTitle: 'text-body-3 mb-1 font-bold uppercase',
    upsellText: 'text-body-3 mb-4 leading-normal opacity-80',
    upsellButton:
      'bg-surface-paper text-surface-ink ui-hover:bg-accent-red ui-hover:text-surface-paper inline-flex h-9.5 items-center px-4.5 text-body-3 font-bold transition-colors',
    label: 'text-data-overline-11 mb-1.5 block font-bold uppercase tracking-[--spacing(0.625)]',
    input:
      'bg-surface-paper border-surface-ink/40 focus:border-surface-ink text-body-3 w-full rounded-none border-2 px-3 py-2 focus:outline-none',
    inputBase: 'bg-surface-paper text-body-3 w-full rounded-none border-2 px-3 py-2 focus:outline-none',
    inputOk: 'border-surface-ink/40 focus:border-surface-ink',
    inputBad: 'border-accent-red focus:border-accent-red',
    fieldError: 'text-body-3 text-accent-red mt-1.5',
    checkbox: 'accent-surface-ink size-4',
    checkLabel: 'text-body-3',
    submit:
      'bg-surface-ink text-surface-paper ui-hover:bg-accent-red text-ui-button-15 h-13 w-full font-bold tracking-[--spacing(0.25)] transition-colors disabled:opacity-30',
    error: 'border-accent-red text-accent-red text-body-3 border-2 p-4',
  },
} as const;

export default function RSVPForm({
  showId,
  ticketUrl,
  variant = 'legacy',
}: {
  showId: number;
  ticketUrl?: string;
  variant?: keyof typeof LOOKS;
}) {
  const c = LOOKS[variant];
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    guests: '1',
    emailList: false,
  });
  // Honeypot — hidden from real users, only bots fill it. Sent to the server,
  // which silently drops any submission that has it set.
  const [website, setWebsite] = useState('');
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
      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          showId,
          name: formData.name,
          email: formData.email,
          guests: formData.guests,
          emailList: formData.emailList,
          website,
        }),
      });

      if (!response.ok) throw new Error('RSVP submission failed');

      setStatus('success');
      setFormData({ name: '', email: '', guests: '1', emailList: false });
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <div className={c.panel}>
      <h2 className={c.title}>RSVP for this show</h2>
      <p className={c.intro}>
        RSVP below to get the venue address and show details emailed to you.
        {ticketUrl && (
          <> After submitting, you'll have the option to <strong>buy an advance ticket</strong> to guarantee your spot.</>
        )}
      </p>

      {status === 'success' ? (
        <div className="space-y-4">
          <div className={c.success}>
            Thanks for your RSVP! Check your email for the full details.
          </div>
          {ticketUrl && (
            <div className={c.upsell}>
              <p className={c.upsellTitle}>🎟 Want to guarantee your spot?</p>
              <p className={c.upsellText}>
                RSVPs are first-come, first-served and the venue is small. Buying an advance ticket means you're in — no matter how packed it gets.
              </p>
              <a
                href={ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={c.upsellButton}
              >
                Buy a Ticket →
              </a>
            </div>
          )}
        </div>
      ) : (
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
            <label htmlFor="name" className={c.label}>
              Name
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={c.input}
            />
          </div>

          <div>
            <label htmlFor="email" className={c.label}>
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
              className={`${c.inputBase} ${emailError ? c.inputBad : c.inputOk}`}
            />
            {emailError && (
              <p className={c.fieldError}>{emailError}</p>
            )}
          </div>

          <div>
            <label htmlFor="guests" className={c.label}>
              Number of guests (including you)
            </label>
            <select
              id="guests"
              value={formData.guests}
              onChange={(e) => setFormData({ ...formData, guests: e.target.value })}
              className={c.input}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5+</option>
            </select>
          </div>

          <div className="flex items-center gap-2.5">
            <input
              type="checkbox"
              id="emailList"
              checked={formData.emailList}
              onChange={(e) => setFormData({ ...formData, emailList: e.target.checked })}
              className={c.checkbox}
            />
            <label htmlFor="emailList" className={c.checkLabel}>
              Add me to the email list for future shows
            </label>
          </div>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className={c.submit}
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit RSVP'}
          </button>

          {status === 'error' && (
            <div className={c.error}>
              Something went wrong. Please try again.
            </div>
          )}
        </form>
      )}
    </div>
  );
}