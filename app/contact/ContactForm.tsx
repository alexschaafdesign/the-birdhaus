'use client';

import { useState } from 'react';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import { FORM } from '@/components/night/form';
import { parseAvailability, type AvailabilityEntry } from '@/lib/submissions';

// The About/Contact page's form, with a "Show requests" / "General contact"
// toggle.
//
// Show requests post to /api/show-request, which saves them to `submissions`
// so they land on the admin Submissions board. That's a database write only
// (nothing leaves the app), so it runs the same on staging, against staging's
// database.
//
// General messages post to the venue's Google Apps Script endpoint (the
// response isn't read; a network failure shows the fallback address).
// `logOnly` (staging, previews, local dev) posts to /api/staging/outbox
// instead, which logs and sends nothing.

const CONTACT_URL = 'https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec';
const LOG_ONLY_URL = '/api/staging/outbox';
const SHOW_REQUEST_URL = '/api/show-request';

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

// True when every date row is filled in (a range also needs from <= to).
function entriesComplete(entries: AvailabilityEntry[]): boolean {
  return entries.every(e =>
    e.type === 'date' ? Boolean(e.value) : Boolean(e.from && e.to && e.from <= e.to)
  );
}

const FIELD = FORM.field;
const LABEL = FORM.label;
const FALLBACK_ERROR = 'Something went wrong — try emailing us directly at alex@thebirdhaus.org';

type Tab = 'show' | 'general';
type Status = 'idle' | 'sending' | 'success' | 'error';

const TABS: [Tab, string][] = [
  ['show', 'Show requests'],
  ['general', 'General contact'],
];

export function ContactForm({ logOnly }: { logOnly: boolean }) {
  const [tab, setTab] = useState<Tab>('show');

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div role="group" aria-label="What are you writing about?" className="border-surface-ink flex w-fit border">
        {TABS.map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(key)}
              className={`text-ui-nav-item-14 focus-visible:outline-accent-red cursor-pointer px-4 py-2 tracking-[--spacing(0.25)] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 ${
                active
                  ? 'bg-surface-ink text-surface-paper'
                  : 'hover:bg-surface-paper-shade'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Both stay mounted so switching tabs keeps what's been typed. */}
      <div hidden={tab !== 'show'}>
        <ShowRequestForm />
      </div>
      <div hidden={tab !== 'general'}>
        <GeneralForm logOnly={logOnly} />
      </div>
    </div>
  );
}

function SuccessNote() {
  return (
    <p className="text-body-1" role="status">
      Thanks for reaching out! We&apos;ll get back to you as soon as we can.
    </p>
  );
}

function ShowRequestForm() {
  const empty = { contactName: '', email: '', bandName: '', social: '', vibe: '', comments: '' };
  const [sr, setSr] = useState(empty);
  // Honeypot: hidden from real users; the API silently drops filled submissions.
  const [website, setWebsite] = useState('');
  const [availability, setAvailability] = useState<AvailabilityEntry[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [datesError, setDatesError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmail(sr.email);
    if (error) { setEmailError(error); return; }
    setEmailError(null);

    if (availability.length === 0) {
      setDatesError('Please add at least one date or date range.');
      return;
    }
    const parsed = parseAvailability(availability);
    if (!parsed || !entriesComplete(parsed)) {
      setDatesError('Please fill in every date field, or remove incomplete ones.');
      return;
    }
    setDatesError(null);
    setStatus('sending');

    try {
      const res = await fetch(SHOW_REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sr, availability: parsed, website }),
      });
      if (!res.ok) throw new Error('Request failed');
      setStatus('success');
      setSr(empty);
      setAvailability([]);
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') return <SuccessNote />;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Honeypot: off-screen, not focusable, hidden from assistive tech. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="sr-website">Website</label>
        <input
          type="text"
          id="sr-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="sr-name" className={LABEL}>
          Your name
        </label>
        <input
          id="sr-name"
          type="text"
          required
          autoComplete="name"
          value={sr.contactName}
          onChange={e => setSr(p => ({ ...p, contactName: e.target.value }))}
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="sr-email" className={LABEL}>
          Your email
        </label>
        <input
          id="sr-email"
          type="email"
          required
          autoComplete="email"
          value={sr.email}
          onChange={e => {
            setSr(p => ({ ...p, email: e.target.value }));
            if (emailError) setEmailError(null);
          }}
          onBlur={e => {
            if (e.target.value.trim()) setEmailError(validateEmail(e.target.value));
          }}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'sr-email-error' : undefined}
          className={emailError ? FORM.fieldInvalid : FIELD}
        />
        {emailError && (
          <p id="sr-email-error" className={FORM.fieldError} role="alert">
            {emailError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="sr-band" className={LABEL}>
          Band / artist name
        </label>
        <input
          id="sr-band"
          type="text"
          required
          value={sr.bandName}
          onChange={e => setSr(p => ({ ...p, bandName: e.target.value }))}
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="sr-social" className={LABEL}>
          Instagram, website, or social
        </label>
        <input
          id="sr-social"
          type="text"
          placeholder="@handle or URL"
          value={sr.social}
          onChange={e => setSr(p => ({ ...p, social: e.target.value }))}
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="sr-vibe" className={LABEL}>
          Genre / what&apos;s your vibe
        </label>
        <input
          id="sr-vibe"
          type="text"
          placeholder="e.g. dreamy punk, ambient country, chaotic jazz..."
          value={sr.vibe}
          onChange={e => setSr(p => ({ ...p, vibe: e.target.value }))}
          className={FIELD}
        />
      </div>
      <fieldset aria-describedby={datesError ? 'sr-dates-error' : undefined}>
        <legend className={LABEL}>Dates you&apos;re looking for</legend>
        <p className={FORM.hint}>Add as many specific dates or date ranges as needed.</p>
        <AvailabilityPicker
          entries={availability}
          onChange={next => {
            setAvailability(next);
            if (datesError) setDatesError(null);
          }}
          inputClassName={`${FIELD} w-44`}
          size="md"
        />
        {datesError && (
          <p id="sr-dates-error" className={`${FORM.fieldError} mt-2`} role="alert">
            {datesError}
          </p>
        )}
      </fieldset>
      <div>
        <label htmlFor="sr-comments" className={LABEL}>
          Anything else
        </label>
        <textarea
          id="sr-comments"
          rows={4}
          placeholder="Specific needs or dreams etc!"
          value={sr.comments}
          onChange={e => setSr(p => ({ ...p, comments: e.target.value }))}
          className={`${FIELD} resize-none`}
        />
      </div>
      {status === 'error' && (
        <p className={FORM.error} role="alert">
          {FALLBACK_ERROR}
        </p>
      )}
      <button type="submit" disabled={status === 'sending'} className={FORM.secondary}>
        {status === 'sending' ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}

function GeneralForm({ logOnly }: { logOnly: boolean }) {
  const [ct, setCt] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState<Status>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmail(ct.email);
    if (error) { setEmailError(error); return; }
    setEmailError(null);
    setStatus('sending');
    try {
      await fetch(logOnly ? LOG_ONLY_URL : CONTACT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'contact', ...ct }).toString(),
      });
      setStatus('success');
      setCt({ name: '', email: '', message: '' });
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') return <SuccessNote />;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <label htmlFor="contact-name" className={LABEL}>
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          required
          autoComplete="name"
          value={ct.name}
          onChange={e => setCt(p => ({ ...p, name: e.target.value }))}
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="contact-email" className={LABEL}>
          Email
        </label>
        <input
          id="contact-email"
          type="email"
          required
          autoComplete="email"
          value={ct.email}
          onChange={e => {
            setCt(p => ({ ...p, email: e.target.value }));
            if (emailError) setEmailError(null);
          }}
          onBlur={e => {
            if (e.target.value.trim()) setEmailError(validateEmail(e.target.value));
          }}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? 'contact-email-error' : undefined}
          className={emailError ? FORM.fieldInvalid : FIELD}
        />
        {emailError && (
          <p id="contact-email-error" className={FORM.fieldError} role="alert">
            {emailError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="contact-message" className={LABEL}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          value={ct.message}
          onChange={e => setCt(p => ({ ...p, message: e.target.value }))}
          className={`${FIELD} resize-none`}
        />
      </div>
      {status === 'error' && (
        <p className={FORM.error} role="alert">
          {FALLBACK_ERROR}
        </p>
      )}
      <button type="submit" disabled={status === 'sending'} className={FORM.secondary}>
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
