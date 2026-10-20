'use client';

import { useState } from 'react';
import { FORM } from '@/components/night/form';

// The About/Contact page's message form, posted to the venue's Google Apps
// Script endpoint (the response isn't read; a network failure shows the
// fallback address). `logOnly` (staging, previews, local dev) posts to
// /api/staging/outbox instead, which logs and sends nothing.

const CONTACT_URL = 'https://script.google.com/macros/s/AKfycbyqjkeA5Ik4w6pTpB9ZbZ-J0X8R3g6Zi0MAhlkEOBWTjZ2ncFmXH6AUH2IN5dqutsDPpA/exec';
const LOG_ONLY_URL = '/api/staging/outbox';

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

const FIELD = FORM.field;
const LABEL = FORM.label;

export function ContactForm({ logOnly }: { logOnly: boolean }) {
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
      await fetch(logOnly ? LOG_ONLY_URL : CONTACT_URL, {
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

  if (ctStatus === 'success') {
    return (
      <p className="text-body-1" role="status">
        Thanks for reaching out! We&apos;ll get back to you as soon as we can.
      </p>
    );
  }

  return (
    <form onSubmit={handleContact} className="flex max-w-xl flex-col gap-5">
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
            if (ctEmailError) setCtEmailError(null);
          }}
          onBlur={e => {
            if (e.target.value.trim()) setCtEmailError(validateEmail(e.target.value));
          }}
          aria-invalid={ctEmailError ? true : undefined}
          aria-describedby={ctEmailError ? 'contact-email-error' : undefined}
          className={ctEmailError ? FORM.fieldInvalid : FIELD}
        />
        {ctEmailError && (
          <p id="contact-email-error" className={FORM.fieldError} role="alert">
            {ctEmailError}
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
      {ctStatus === 'error' && (
        <p className={FORM.error} role="alert">
          Something went wrong — try emailing us directly at alex@thebirdhaus.org
        </p>
      )}
      <button
        type="submit"
        disabled={ctStatus === 'sending'}
        className="text-ui-nav-item-14 border-surface-ink hover:bg-surface-ink hover:text-surface-paper focus-visible:outline-accent-red w-fit cursor-pointer border px-6 py-2 tracking-[--spacing(0.25)] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        {ctStatus === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
