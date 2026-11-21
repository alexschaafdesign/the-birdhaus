'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedEdit, RehearsalSettingsForAdmin } from '@/lib/rehearsal/settings';
import PublicPageSettings from './PublicPageSettings';
import { ADMIN_TYPE, FIELD_INLINE, buttonClassName } from '@/components/admin/ui';
import { FORM } from '@/components/night/form';

// Rehearsal settings. Prices are typed in dollars and sent as cents.
// Calendar feeds are no longer read (blocks on the master Calendar replaced
// them); any saved feed links are kept as they are, untouched by this form.

const label = FORM.label;
const hint = 'font-normal normal-case tracking-normal text-surface-ink/60';
const input = FORM.field;
const area = `${input} min-h-[6rem] leading-relaxed`;

function dollars(cents: number | null) {
  return cents === null ? '' : (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
}

function toCents(raw: string): number | null | 'bad' {
  const t = raw.trim().replace(/^\$/, '');
  if (t === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'bad';
  return Math.round(Number(t) * 100);
}

function Field({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 block">
      <span className={label}>
        {title} {note && <span className={hint}>({note})</span>}
      </span>
      {children}
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 border border-surface-ink p-4">
      <legend className={`${ADMIN_TYPE.overline} px-1`}>{title}</legend>
      {children}
    </fieldset>
  );
}

export default function RehearsalSettingsForm({ initial }: { initial: RehearsalSettingsForAdmin }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [price, setPrice] = useState(dollars(initial.priceCents));
  const [repeatPrice, setRepeatPrice] = useState(dollars(initial.repeatPriceCents));
  const [newGear, setNewGear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function set<K extends keyof RehearsalSettingsForAdmin>(k: K, v: RehearsalSettingsForAdmin[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
    setSavedAt(null);
  }

  function num<K extends keyof RehearsalSettingsForAdmin>(k: K) {
    return {
      type: 'number' as const,
      value: String(s[k]),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as RehearsalSettingsForAdmin[K]),
      className: input,
    };
  }

  function txt<K extends keyof RehearsalSettingsForAdmin>(k: K) {
    return {
      value: String(s[k]),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        set(k, e.target.value as RehearsalSettingsForAdmin[K]),
    };
  }

  function addGear() {
    const label = newGear.trim().replace(/\s+/g, ' ');
    if (!label) return;
    if (!s.gearOptions.some((g) => g.toLowerCase() === label.toLowerCase())) {
      set('gearOptions', [...s.gearOptions, label]);
    }
    setNewGear('');
  }

  async function save() {
    setError(null);
    setSavedAt(null);
    const priceCents = toCents(price);
    const repeatPriceCents = toCents(repeatPrice);
    if (priceCents === 'bad' || priceCents === null) return setError('Price must be a dollar amount, like 60 or 62.50.');
    if (repeatPriceCents === 'bad') return setError('Repeat price must be a dollar amount, or blank.');
    // Keep whatever feed links are stored; nothing reads them any more.
    const icsFeeds: FeedEdit[] = s.icsFeeds.map((_, index) => ({ keep: index }));

    const { icsFeeds: _masked, updatedAt: _u, ...rest } = s;
    void _masked;
    void _u;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/rehearsal/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          priceCents,
          repeatPriceCents,
          icsFeeds,
          // A typed-but-not-added item still counts (the server de-duplicates).
          gearOptions: newGear.trim() ? [...rest.gearOptions, newGear.trim()] : rest.gearOptions,
        }),
      });
      const data = (await res.json().catch(() => null)) as (RehearsalSettingsForAdmin & { error?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.error ?? `Save failed (${res.status})`);
      setS(data);
      setPrice(dollars(data.priceCents));
      setRepeatPrice(dollars(data.repeatPriceCents));
      setNewGear('');
      setSavedAt(new Date().toLocaleTimeString());
      router.refresh(); // standing-hours labels follow the block length
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {s.paymentsEnabled && (
          <Group title="Prices">
            <Field title="Price per session" note="dollars">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={input} />
            </Field>
            <Field title="Repeat price per session" note="dollars; blank = same as one-off">
              <input
                value={repeatPrice}
                onChange={(e) => setRepeatPrice(e.target.value)}
                inputMode="decimal"
                className={input}
              />
            </Field>
          </Group>
        )}

        <Group title="Booking window and cutoffs">
          <Field title="Earliest booking" note="hours from now">
            <input {...num('windowMinHours')} min={0} max={720} />
          </Field>
          <Field title="Latest booking" note="weeks from now">
            <input {...num('windowMaxWeeks')} min={1} max={52} />
          </Field>
          <Field title="Bands can cancel until" note="hours before the session">
            <input {...num('cancelCutoffHours')} min={0} max={720} />
          </Field>
          <Field title="Unanswered requests expire after" note="days">
            <input {...num('pendingExpiryDays')} min={1} max={60} />
          </Field>
        </Group>

        <Group title="Show days">
          <div className="space-y-2 text-body-3">
            <label className="flex cursor-pointer flex-wrap items-center gap-2">
              <input
                type="radio" className="accent-surface-ink size-4"
                checked={s.showDayRule === 'whole_day'}
                onChange={() => set('showDayRule', 'whole_day')}
              />
              Block the whole day
            </label>
            <label className="flex cursor-pointer flex-wrap items-center gap-2">
              <input
                type="radio" className="accent-surface-ink size-4"
                checked={s.showDayRule === 'from_time'}
                onChange={() => set('showDayRule', 'from_time')}
              />
              Block from
              <input
                type="time"
                value={s.showDayFrom}
                onChange={(e) => set('showDayFrom', e.target.value)}
                disabled={s.showDayRule !== 'from_time'}
                className={`${FIELD_INLINE} w-auto disabled:opacity-40`}
              />
              onward
            </label>
          </div>
          <p className="text-data-caption-13 text-surface-ink/60">
            Any show that isn&apos;t cancelled or postponed counts, announced or not. Blocks on the master{' '}
            <a href="/admin/calendar" className={ADMIN_TYPE.link}>Calendar</a> are closed too.
          </p>
        </Group>

        <Group title="Payments">
          <label className="text-body-3 flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-surface-ink size-4" checked={s.paymentsEnabled} onChange={(e) => set('paymentsEnabled', e.target.checked)} />
            Track payments
          </label>
          {s.paymentsEnabled ? (
            <Field title="Venmo business handle" note="without @">
              <input {...txt('venmoHandle')} className={input} />
            </Field>
          ) : (
            <p className="text-data-caption-13 text-surface-ink/60">
              Off: no prices, totals, Venmo or paid/outstanding anywhere — on the site, in emails or in admin. Keep each
              band&apos;s rate in its &ldquo;Rate &amp; payment notes&rdquo; on the band page.
            </p>
          )}
        </Group>

        <Group title="House gear">
          <p className="text-data-caption-13 text-surface-ink/60">
            The gear list on the public page and the &ldquo;gear needed&rdquo; checkboxes bands see when they request.
            Removing an item keeps it on bookings that already asked for it.
          </p>
          <ul className="flex flex-wrap gap-2">
            {s.gearOptions.map((g, i) => (
              <li
                key={g}
                className="inline-flex items-center gap-1.5 border border-surface-ink px-2 py-1 text-body-3"
              >
                {g}
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...s.gearOptions];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      set('gearOptions', next);
                    }}
                    aria-label={`Move ${g} earlier`}
                    className="text-surface-ink/60 cursor-pointer hover:text-accent-red"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => set('gearOptions', s.gearOptions.filter((_, j) => j !== i))}
                  aria-label={`Remove ${g}`}
                  className="text-surface-ink/60 cursor-pointer hover:text-accent-red"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={newGear}
              onChange={(e) => setNewGear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addGear();
                }
              }}
              placeholder="e.g. Second guitar amp"
              maxLength={60}
              className={input}
            />
            <button
              type="button"
              onClick={addGear}
              disabled={!newGear.trim()}
              className={`${buttonClassName('secondary', 's')} disabled:opacity-40`}
            >
              Add
            </button>
          </div>
        </Group>

        <Group title="Arrival (sent only to approved bands)">
          <Field title="Address">
            <textarea {...txt('address')} className={area} />
          </Field>
          <Field title="Arrival notes">
            <textarea {...txt('arrivalNotes')} className={area} />
          </Field>
          <Field title="Cancellation policy">
            <textarea {...txt('cancellationPolicy')} className={area} />
          </Field>
        </Group>
      </div>

      <Group title="Public page (/rehearsal)">
        <PublicPageSettings
          value={{
            publicPageEnabled: s.publicPageEnabled,
            publicIntro: s.publicIntro,
            publicFactsLine: s.publicFactsLine,
            houseRules: s.houseRules,
            photoUrls: s.photoUrls,
          }}
          onChange={(patch) => {
            setS((prev) => ({ ...prev, ...patch }));
            setSavedAt(null);
          }}
        />
      </Group>

      <Group title="Emails to bands">
        <label className="text-body-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-surface-ink size-4" checked={s.reminderEmailsEnabled} onChange={(e) => set('reminderEmailsEnabled', e.target.checked)} />
          Send the day-before reminder
        </label>
        <label className="text-body-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-surface-ink size-4" checked={s.lapsedEmailsEnabled} onChange={(e) => set('lapsedEmailsEnabled', e.target.checked)} />
          Tell bands when an unanswered request lapses
        </label>
      </Group>

      <Group title="Email wording">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field title="Approval email intro">
            <textarea {...txt('emailApprovedIntro')} className={area} />
          </Field>
          <Field title="Decline email intro">
            <textarea {...txt('emailDeclinedIntro')} className={area} />
          </Field>
          <Field title="Day-before reminder intro">
            <textarea {...txt('emailReminderIntro')} className={area} />
          </Field>
          <Field title="Interest form auto-reply">
            <textarea {...txt('emailLeadAutoreply')} className={area} />
          </Field>
        </div>
      </Group>

      {error && (
        <div role="alert" className="border-accent-red text-body-3 text-accent-red border-2 p-3">{error}</div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={buttonClassName('primary', 'm')}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {savedAt && <span className="text-body-3 text-surface-ink/60">Saved at {savedAt}</span>}
      </div>
    </div>
  );
}
