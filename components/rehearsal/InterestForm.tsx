'use client';

import { useState } from 'react';
import { FORM } from '@/components/night/form';

// "I'm interested" form on /rehearsal. Posts to /api/rehearsal/interest.
// `website` is a honeypot: off-screen, out of the tab order, hidden from
// screen readers; people never fill it.

const FREQUENCIES: Array<[string, string]> = [
  ['one_time', 'One time'],
  ['weekly', 'Weekly'],
  ['biweekly', 'Every other week'],
  ['now_and_then', 'Now and then'],
];

type Fields = {
  name: string;
  project: string;
  email: string;
  phone: string;
  people: string;
  genreLinks: string;
  frequency: string;
  preferredTimes: string;
  notes: string;
  website: string;
};

const EMPTY: Fields = {
  name: '',
  project: '',
  email: '',
  phone: '',
  people: '',
  genreLinks: '',
  frequency: '',
  preferredTimes: '',
  notes: '',
  website: '',
};

export default function InterestForm() {
  const [f, setF] = useState<Fields>(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ field?: string; text: string } | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setF({ ...f, [k]: e.target.value });
    if (error?.field === k) setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/rehearsal/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(f),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError({ field: data?.field, text: data?.error ?? 'That didn’t send — try again.' });
        return;
      }
      setDone(true);
    } catch {
      setError({ text: 'That didn’t send — check your connection and try again.' });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className={FORM.notice}>
        Thanks! We got it, and a copy is on its way to your inbox. If it’s a fit, your booking link will follow.
      </p>
    );
  }

  const field = (k: keyof Fields) => (error?.field === k ? FORM.fieldInvalid : FORM.field);
  const fieldError = (k: keyof Fields) =>
    error?.field === k ? (
      <p id={`${k}-error`} role="alert" className={FORM.fieldError}>
        {error.text}
      </p>
    ) : null;
  const aria = (k: keyof Fields) =>
    error?.field === k ? { 'aria-invalid': true, 'aria-describedby': `${k}-error` } : {};

  return (
    <form onSubmit={submit} noValidate className="relative flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="ri-name" className={FORM.label}>
            Your name
          </label>
          <input id="ri-name" required autoComplete="name" value={f.name} onChange={set('name')} className={field('name')} {...aria('name')} />
          {fieldError('name')}
        </div>
        <div>
          <label htmlFor="ri-project" className={FORM.label}>
            Band / project
          </label>
          <input id="ri-project" value={f.project} onChange={set('project')} className={field('project')} {...aria('project')} />
          {fieldError('project')}
        </div>
        <div>
          <label htmlFor="ri-email" className={FORM.label}>
            Email
          </label>
          <input
            id="ri-email"
            type="email"
            required
            autoComplete="email"
            value={f.email}
            onChange={set('email')}
            className={field('email')}
            {...aria('email')}
          />
          {fieldError('email')}
        </div>
        <div>
          <label htmlFor="ri-phone" className={FORM.label}>
            Phone <span className="font-normal normal-case opacity-70">(optional)</span>
          </label>
          <input id="ri-phone" type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} className={field('phone')} {...aria('phone')} />
          {fieldError('phone')}
        </div>
        <div>
          <label htmlFor="ri-people" className={FORM.label}>
            How many people
          </label>
          <input
            id="ri-people"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={f.people}
            onChange={set('people')}
            className={field('people')}
            {...aria('people')}
          />
          {fieldError('people')}
        </div>
        <div>
          <label htmlFor="ri-times" className={FORM.label}>
            Days / times that work
          </label>
          <input
            id="ri-times"
            value={f.preferredTimes}
            onChange={set('preferredTimes')}
            placeholder="Weeknights after 6, Sunday afternoons"
            className={field('preferredTimes')}
            {...aria('preferredTimes')}
          />
          {fieldError('preferredTimes')}
        </div>
      </div>

      <fieldset {...(error?.field === 'frequency' ? { 'aria-describedby': 'frequency-error' } : {})}>
        <legend className={FORM.label}>How often</legend>
        <div className="text-body-3 flex flex-wrap gap-x-6 gap-y-2">
          {FREQUENCIES.map(([value, text]) => (
            <label key={value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="frequency"
                value={value}
                checked={f.frequency === value}
                onChange={set('frequency')}
                className="accent-accent-red size-4"
              />
              {text}
            </label>
          ))}
        </div>
        {fieldError('frequency')}
      </fieldset>

      <div>
        <label htmlFor="ri-genre" className={FORM.label}>
          What you sound like <span className="font-normal normal-case opacity-70">(genre, links)</span>
        </label>
        <textarea
          id="ri-genre"
          rows={2}
          value={f.genreLinks}
          onChange={set('genreLinks')}
          placeholder="Garage pop · bandcamp.com/yourband"
          className={field('genreLinks')}
          {...aria('genreLinks')}
        />
        {fieldError('genreLinks')}
      </div>
      <div>
        <label htmlFor="ri-notes" className={FORM.label}>
          Anything else <span className="font-normal normal-case opacity-70">(optional)</span>
        </label>
        <textarea id="ri-notes" rows={3} value={f.notes} onChange={set('notes')} className={field('notes')} {...aria('notes')} />
        {fieldError('notes')}
      </div>

      {/* Honeypot: people never see or fill this. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor="ri-website">Website</label>
        <input id="ri-website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} />
      </div>

      {error && !error.field && (
        <p role="alert" className={FORM.error}>
          {error.text}
        </p>
      )}
      <button type="submit" disabled={sending} className={FORM.primary}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
