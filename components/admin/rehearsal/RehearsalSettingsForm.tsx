'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedEdit, RehearsalSettingsForAdmin } from '@/lib/rehearsal/settings';
import FeedCheck from './FeedCheck';
import PublicPageSettings from './PublicPageSettings';

// Rehearsal settings. Prices are typed in dollars and sent as cents. Calendar
// feeds arrive masked; a stored feed is kept by its index, a new one is sent
// as a URL (and is masked once saved).

const label = 'block text-xs uppercase tracking-wide text-[#E8E0D0]/60';
const hint = 'normal-case tracking-normal text-[#E8E0D0]/40';
const input =
  'w-full rounded border border-[#E8E0D0]/30 bg-[#171412] px-3 py-2 text-sm focus:outline-none focus:border-[#E8E0D0]/60 [color-scheme:dark]';
const area = `${input} min-h-[6rem] leading-relaxed`;

type FeedRow = { kind: 'stored'; index: number; masked: string } | { kind: 'new'; url: string };

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
    <fieldset className="space-y-4 rounded-lg border border-[#E8E0D0]/15 p-4">
      <legend className="px-1 text-sm font-semibold uppercase tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

export default function RehearsalSettingsForm({ initial }: { initial: RehearsalSettingsForAdmin }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [price, setPrice] = useState(dollars(initial.priceCents));
  const [repeatPrice, setRepeatPrice] = useState(dollars(initial.repeatPriceCents));
  const [feeds, setFeeds] = useState<FeedRow[]>(
    initial.icsFeeds.map((masked, index) => ({ kind: 'stored', index, masked })),
  );
  const [newFeed, setNewFeed] = useState('');
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

  function addFeed() {
    const url = newFeed.trim();
    if (!url) return;
    setFeeds([...feeds, { kind: 'new', url }]);
    setNewFeed('');
    setSavedAt(null);
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
    const pendingFeed = newFeed.trim();
    const allFeeds = pendingFeed ? [...feeds, { kind: 'new' as const, url: pendingFeed }] : feeds;
    const icsFeeds: FeedEdit[] = allFeeds.map((f) => (f.kind === 'stored' ? { keep: f.index } : { url: f.url }));

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
      setFeeds(data.icsFeeds.map((masked, index) => ({ kind: 'stored', index, masked })));
      setNewFeed('');
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
        <Group title={s.paymentsEnabled ? 'Blocks and prices' : 'Blocks'}>
          <Field title="Block length" note="minutes">
            <input {...num('blockMinutes')} min={30} max={720} step={15} />
          </Field>
          {s.paymentsEnabled && (
            <>
          <Field title="Price per block" note="dollars">
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={input} />
          </Field>
          <Field title="Repeat price per block" note="dollars; blank = same as one-off">
            <input
              value={repeatPrice}
              onChange={(e) => setRepeatPrice(e.target.value)}
              inputMode="decimal"
              className={input}
            />
          </Field>
            </>
          )}
        </Group>

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
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={s.showDayRule === 'whole_day'}
                onChange={() => set('showDayRule', 'whole_day')}
              />
              Block the whole day
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={s.showDayRule === 'from_time'}
                onChange={() => set('showDayRule', 'from_time')}
              />
              Block from
              <input
                type="time"
                value={s.showDayFrom}
                onChange={(e) => set('showDayFrom', e.target.value)}
                disabled={s.showDayRule !== 'from_time'}
                className="rounded border border-[#E8E0D0]/30 bg-[#171412] px-2 py-1 text-sm [color-scheme:dark] disabled:opacity-40"
              />
              onward
            </label>
          </div>
          <p className="text-xs text-[#E8E0D0]/40">
            Any show that isn&apos;t cancelled or postponed counts, announced or not. Days marked Not available in
            Booking are blacked out too.
          </p>
        </Group>

        <Group title="Calendar feeds (busy times)">
          <p className="text-xs text-[#E8E0D0]/40">
            Private .ics links from Apple Calendar. Only start and end times are used; titles are never stored.
            Saved links are shown shortened.
          </p>
          {feeds.length === 0 && <p className="text-sm text-[#E8E0D0]/40">No feeds yet.</p>}
          <ul className="space-y-2">
            {feeds.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <code className="flex-1 truncate text-[#E8E0D0]/80">{f.kind === 'stored' ? f.masked : f.url}</code>
                {f.kind === 'new' && <span className="text-xs text-[#E8E0D0]/40">unsaved</span>}
                <button
                  type="button"
                  onClick={() => {
                    setFeeds(feeds.filter((_, j) => j !== i));
                    setSavedAt(null);
                  }}
                  className="text-xs text-[#E8E0D0]/50 underline hover:text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <input
              value={newFeed}
              onChange={(e) => setNewFeed(e.target.value)}
              placeholder="webcal://p…-caldav.icloud.com/published/2/…"
              className={input}
            />
            <button
              type="button"
              onClick={addFeed}
              disabled={!newFeed.trim()}
              className="rounded border border-[#E8E0D0]/30 px-3 text-sm hover:border-[#E8E0D0]/60 disabled:opacity-40"
            >
              Add
            </button>
          </div>
          <FeedCheck />
        </Group>

        <Group title="Payments">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.paymentsEnabled} onChange={(e) => set('paymentsEnabled', e.target.checked)} />
            Track payments
          </label>
          {s.paymentsEnabled ? (
            <Field title="Venmo business handle" note="without @">
              <input {...txt('venmoHandle')} className={input} />
            </Field>
          ) : (
            <p className="text-xs text-[#E8E0D0]/40">
              Off: no prices, totals, Venmo or paid/outstanding anywhere — on the site, in emails or in admin. Keep each
              band&apos;s rate in its &ldquo;Rate &amp; payment notes&rdquo; on the band page.
            </p>
          )}
        </Group>

        <Group title="House gear">
          <p className="text-xs text-[#E8E0D0]/40">
            The gear list on the public page and the &ldquo;gear needed&rdquo; checkboxes bands see when they request.
            Removing an item keeps it on bookings that already asked for it.
          </p>
          <ul className="flex flex-wrap gap-2">
            {s.gearOptions.map((g, i) => (
              <li
                key={g}
                className="inline-flex items-center gap-1.5 rounded border border-[#E8E0D0]/30 px-2 py-1 text-sm"
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
                    className="text-[#E8E0D0]/50 hover:text-[#E8E0D0]"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => set('gearOptions', s.gearOptions.filter((_, j) => j !== i))}
                  aria-label={`Remove ${g}`}
                  className="text-[#E8E0D0]/50 hover:text-red-300"
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
              className="rounded border border-[#E8E0D0]/30 px-3 text-sm hover:border-[#E8E0D0]/60 disabled:opacity-40"
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.reminderEmailsEnabled} onChange={(e) => set('reminderEmailsEnabled', e.target.checked)} />
          Send the day-before reminder
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.lapsedEmailsEnabled} onChange={(e) => set('lapsedEmailsEnabled', e.target.checked)} />
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
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">{error}</div>
      )}

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {savedAt && <span className="text-sm text-[#E8E0D0]/50">Saved at {savedAt}</span>}
      </div>
    </div>
  );
}
