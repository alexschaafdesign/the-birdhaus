'use client';

import { useState, type ReactNode } from 'react';
import AvailabilityPicker from '@/components/AvailabilityPicker';
import { FORM } from '@/components/night/form';
import {
  FORMAT_LABELS,
  SUBMISSION_FORMATS,
  parseAvailability,
  type AvailabilityEntry,
  type BillPreference,
  type SubmissionFormat,
} from '@/lib/submissions';

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

const BILL_CHOICES: [BillPreference, string][] = [
  ['building', 'We could put a bill together'],
  ['joining', 'Add us to an existing bill'],
  ['either', 'Either works'],
];

type Status = 'idle' | 'sending' | 'error';

const TABS: [Tab, string][] = [
  ['show', 'Show requests'],
  ['general', 'General contact'],
];

export function ContactForm({
  logOnly,
  openDates = [],
  children,
}: {
  logOnly: boolean;
  openDates?: string[];
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('show');
  // Once either form sends, the intro (children), toggle and forms give way to
  // just the thank-you.
  const [sent, setSent] = useState<Tab | null>(null);

  if (sent) {
    return (
      <p className="text-body-1 max-w-xl" role="status">
        {sent === 'show'
          ? 'Thanks! Got your request. We\u2019ll be in touch by email about dates.'
          : 'Thanks for reaching out! We\u2019ll get back to you as soon as we can.'}
      </p>
    );
  }

  return (
    <>
      {children}
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
          <ShowRequestForm onSent={() => setSent('show')} openDates={openDates} />
        </div>
        <div hidden={tab !== 'general'}>
          <GeneralForm logOnly={logOnly} onSent={() => setSent('general')} />
        </div>
      </div>
    </>
  );
}

// Month name for a "YYYY-MM-DD", built from its parts so it can't slip a day
// across time zones.
function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// "January–March 2027" (or one month, or across years) for the open dates'
// first and last months; null with no open dates.
function seasonLabel(dates: string[]): string | null {
  if (dates.length === 0) return null;
  const parts = (iso: string) => {
    const [y, m] = iso.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return { y, key: iso.slice(0, 7), month: d.toLocaleDateString('en-US', { month: 'long' }) };
  };
  const a = parts(dates[0]);
  const b = parts(dates[dates.length - 1]);
  if (a.key === b.key) return `${a.month} ${a.y}`;
  if (a.y === b.y) return `${a.month}–${b.month} ${a.y}`;
  return `${a.month} ${a.y}–${b.month} ${b.y}`;
}

// A toggle chip: a visually hidden checkbox inside an outlined label that
// fills with ink when on.
function Chip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <label
      className={`text-body-3 has-[:focus-visible]:outline-accent-red cursor-pointer border px-3 py-1.5 select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
        on
          ? 'bg-surface-ink text-surface-paper border-surface-ink'
          : 'border-surface-ink hover:bg-surface-paper-shade'
      }`}
    >
      <input type="checkbox" className="sr-only" checked={on} onChange={onToggle} />
      {children}
    </label>
  );
}

// The Booking calendar's open dates as toggle chips, grouped by month.
function OpenDatePicker({
  dates,
  picked,
  onToggle,
}: {
  dates: string[];
  picked: Set<string>;
  onToggle: (date: string) => void;
}) {
  const months: Array<[string, string[]]> = [];
  for (const date of dates) {
    const label = monthLabel(date);
    const last = months[months.length - 1];
    if (last && last[0] === label) last[1].push(date);
    else months.push([label, [date]]);
  }

  return (
    <div className="flex flex-col gap-3">
      {months.map(([label, monthDates]) => (
        <div key={label}>
          <p className="text-data-caption-13 text-surface-ink/60 mb-1.5">{label}</p>
          <div className="flex flex-wrap gap-2">
            {monthDates.map(date => (
              <Chip key={date} on={picked.has(date)} onToggle={() => onToggle(date)}>
                {dayLabel(date)}
              </Chip>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Show requests, ordered band → dates → you. Picked open dates go in as plain
// dates ahead of the band's own entries, so the admin board reads and filters
// them like any other.
function ShowRequestForm({ onSent, openDates }: { onSent: () => void; openDates: string[] }) {
  const empty = {
    bandName: '', social: '', vibe: '', billLineup: '', contactName: '', email: '', comments: '',
  };
  const [sr, setSr] = useState(empty);
  const [formats, setFormats] = useState<Set<SubmissionFormat>>(new Set());
  const [bill, setBill] = useState<BillPreference | ''>('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Honeypot: hidden from real users; the API silently drops filled submissions.
  const [website, setWebsite] = useState('');
  const [availability, setAvailability] = useState<AvailabilityEntry[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [datesError, setDatesError] = useState<string | null>(null);

  const season = seasonLabel(openDates);
  const allPicked = openDates.length > 0 && openDates.every(d => picked.has(d));

  function togglePicked(date: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    if (datesError) setDatesError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formats.size === 0) {
      setFormatsError('Pick solo, full band, or both.');
      return;
    }
    setFormatsError(null);

    if (picked.size === 0 && availability.length === 0) {
      setDatesError(
        openDates.length > 0
          ? 'Please pick at least one date, or add your own.'
          : 'Please add at least one date or date range.'
      );
      return;
    }
    const parsed = parseAvailability(availability);
    if (!parsed || !entriesComplete(parsed)) {
      setDatesError('Please fill in every date field, or remove incomplete ones.');
      return;
    }
    setDatesError(null);

    const error = validateEmail(sr.email);
    if (error) { setEmailError(error); return; }
    setEmailError(null);
    setStatus('sending');

    const pickedEntries: AvailabilityEntry[] = [...picked]
      .sort()
      .map(value => ({ type: 'date', value }));

    try {
      const res = await fetch(SHOW_REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...sr,
          billLineup: bill === 'joining' ? '' : sr.billLineup,
          formats: [...formats],
          billPreference: bill || null,
          availability: [...pickedEntries, ...parsed],
          website,
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      onSent();
    } catch {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <h2 className="text-header-4 font-bold">
          {season ? `Booking ${season}` : 'Want to play the Birdhaus?'}
        </h2>
        <p className="text-body-3 mt-1 leading-normal">
          Tell us about your project and which dates work. Shows are all ages with donation at
          the door.
        </p>
      </div>

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
          Where can we hear you?
        </label>
        <input
          id="sr-social"
          type="text"
          placeholder="Bandcamp, Spotify, Instagram…"
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
      <fieldset aria-describedby={formatsError ? 'sr-formats-error' : undefined}>
        <legend className={LABEL}>Solo or full band</legend>
        <p className={FORM.hint}>Pick both if you can do either.</p>
        <div className="flex flex-wrap gap-2">
          {SUBMISSION_FORMATS.map(f => (
            <Chip
              key={f}
              on={formats.has(f)}
              onToggle={() => {
                setFormats(prev => {
                  const next = new Set(prev);
                  if (next.has(f)) next.delete(f);
                  else next.add(f);
                  return next;
                });
                if (formatsError) setFormatsError(null);
              }}
            >
              {FORMAT_LABELS[f]}
            </Chip>
          ))}
        </div>
        {formatsError && (
          <p id="sr-formats-error" className={FORM.fieldError} role="alert">
            {formatsError}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className={LABEL}>The bill</legend>
        <div className="flex flex-col gap-2">
          {BILL_CHOICES.map(([value, label]) => (
            <label key={value} className="text-body-3 flex w-fit cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="bill"
                required
                value={value}
                checked={bill === value}
                onChange={() => setBill(value)}
                className="accent-surface-ink focus-visible:outline-accent-red size-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              {label}
            </label>
          ))}
        </div>
        {(bill === 'building' || bill === 'either') && (
          <div className="mt-4">
            <label htmlFor="sr-lineup" className={LABEL}>
              Who&apos;d be on it?
            </label>
            <p className={FORM.hint}>Optional. Other bands you&apos;d bring, if you know.</p>
            <textarea
              id="sr-lineup"
              rows={2}
              value={sr.billLineup}
              onChange={e => setSr(p => ({ ...p, billLineup: e.target.value }))}
              className={`${FIELD} resize-none`}
            />
          </div>
        )}
      </fieldset>

      <fieldset aria-describedby={datesError ? 'sr-dates-error' : undefined}>
        <legend className={LABEL}>Dates you&apos;re looking for</legend>
        {openDates.length > 0 && (
          <>
            <p className={FORM.hint}>
              Dates we&apos;re hoping to fill: tap any that work for you. Not set in stone, so if a
              different day suits your bill better, add it below.
            </p>
            <label className="text-body-3 mb-3 flex w-fit cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() => {
                  setPicked(allPicked ? new Set() : new Set(openDates));
                  if (datesError) setDatesError(null);
                }}
                className="accent-surface-ink focus-visible:outline-accent-red size-4 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2"
              />
              We&apos;re flexible: any of these work
            </label>
            <OpenDatePicker dates={openDates} picked={picked} onToggle={togglePicked} />
            <p className={`${FORM.hint} mt-5`}>Other dates or ranges:</p>
          </>
        )}
        {openDates.length === 0 && (
          <p className={FORM.hint}>Add as many specific dates or date ranges as needed.</p>
        )}
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

function GeneralForm({ logOnly, onSent }: { logOnly: boolean; onSent: () => void }) {
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
      onSent();
    } catch {
      setStatus('error');
    }
  }

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
