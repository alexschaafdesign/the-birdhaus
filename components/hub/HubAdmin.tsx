'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ShowAdvanceState, SavedAdvanceVars } from '@/lib/advance';
import ScheduleEditor from '@/components/admin/ScheduleEditor';

// Admin-only controls rendered INTO the band portal (/hub/<token>) when the
// visitor has an admin session — the portal is the one page for everyone:
// bands see the band view; the admin sees the same page plus these. All of it
// is server-gated: the page only fetches/passes ShowAdvanceState (recipient
// emails, Venmo handles, invite state) after isAdminSession(), and every write
// goes through /api/admin/* routes which proxy.ts protects.

const inputClass =
  'bg-transparent border border-surface-ink px-3 py-1.5 text-body-3 focus:outline-none focus:border-accent-red placeholder:text-surface-ink/45';

const buttonClass =
  'border border-surface-ink px-3 py-1.5 text-data-caption-13 hover:bg-surface-paper-shade transition-colors disabled:opacity-40';

function AdminTag() {
  return (
    <span className="text-data-label-10-small uppercase tracking-[0.14em] font-bold text-accent-red border border-accent-red px-1.5 py-0.5">
      admin
    </span>
  );
}

// ---------------------------------------------------------------------------
// Top bar: invite status + send, link copy, back to the show in the admin.
// ---------------------------------------------------------------------------

export function HubAdminBar({ state }: { state: ShowAdvanceState }) {
  // Advancing happens by email outside the app now, so the bar no longer sends
  // the invite: it's just the portal link + the way back to the show. (The
  // invite send route still exists; it's only unlinked here.)
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(state.hubUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy — copy the URL from the address bar.');
    }
  }

  return (
    <div className="border border-accent-red bg-surface-paper-shade p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <AdminTag />
          <button type="button" onClick={copyLink} className={buttonClass}>
            {copied ? 'Copied!' : 'Copy portal link'}
          </button>
        </div>
        <Link
          href={`/admin/shows/${state.showId}`}
          className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
        >
          Show admin →
        </Link>
      </div>
      <p className="text-data-caption-13 text-surface-ink/60">
        What bands see on the portal, plus admin controls. The schedule is edited on the Overview.
      </p>
      {error && (
        <div className="border border-accent-red text-accent-red text-body-3 px-3 py-1.5">
          {error}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits for the inline card editors: each edits a slice of the saved
// SavedAdvanceVars, PUTs the merged whole (partial-update route keeps extras),
// then router.refresh() re-renders the server card with the new content.
// ---------------------------------------------------------------------------

async function putVars(showId: number, vars: SavedAdvanceVars): Promise<void> {
  const res = await fetch(`/api/admin/shows/${showId}/advance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vars }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw new Error(d?.error ?? `Save failed (${res.status})`);
  }
}

// Inline editor under the Schedule card on the show's Overview (admin-only, so
// no ADMIN tag): schedule rows + soundcheck notes + the engineer name shown in
// the header.
export function HubAdminScheduleEdit({ state }: { state: ShowAdvanceState }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SavedAdvanceVars | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bandNames = state.recipients.map((r) => r.name);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await putVars(state.showId, draft);
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setDraft({ ...state.vars })}
          className={buttonClass}
        >
          {state.vars.schedule.length > 0 ? 'Edit schedule & notes' : 'Add a schedule'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-surface-ink bg-surface-paper-shade p-4">
      <div className="flex items-center gap-2">
        <span className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Edit schedule &amp; notes
        </span>
      </div>
      <ScheduleEditor
        rows={draft.schedule}
        bandNames={bandNames}
        onChange={(rows) => setDraft((d) => (d ? { ...d, schedule: rows } : d))}
      />
      <div className="space-y-1">
        <label className="block text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Soundcheck notes
        </label>
        <textarea
          value={draft.soundcheck_notes}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, soundcheck_notes: e.target.value } : d))
          }
          rows={3}
          placeholder="Optional — linecheck order, early arrivals, etc. Shown on the portal."
          className={`${inputClass} w-full resize-y`}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Sound engineer name
        </label>
        <input
          value={draft.sound_engineer}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, sound_engineer: e.target.value } : d))
          }
          placeholder={state.show.soundEngineerName || 'Defaults to the confirmed engineer'}
          className={`${inputClass} w-full`}
        />
      </div>
      {error && <p className="text-data-caption-13 text-accent-red">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Inline editor under the Pay card: the per-show override of the standard deal.
export function HubAdminPayEdit({ state }: { state: ShowAdvanceState }) {
  const router = useRouter();
  const [draft, setDraft] = useState<SavedAdvanceVars | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await putVars(state.showId, draft);
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!draft) {
    return (
      <div className="flex items-center gap-2 pt-1">
        <AdminTag />
        <button type="button" onClick={() => setDraft({ ...state.vars })} className={buttonClass}>
          {state.vars.pay.trim() ? 'Edit pay override' : 'Override pay for this show'}
        </button>
        {state.vars.pay.trim() && (
          <span className="text-data-caption-13 text-surface-ink">Overridden for this show.</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 border border-accent-red bg-surface-paper-shade p-4">
      <div className="flex items-center gap-2">
        <AdminTag />
        <span className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Pay (this show only)
        </span>
      </div>
      <textarea
        value={draft.pay}
        onChange={(e) => setDraft((d) => (d ? { ...d, pay: e.target.value } : d))}
        rows={6}
        placeholder="Blank = standard door deal."
        className={`${inputClass} w-full resize-y`}
      />
      <div className="flex items-center gap-3 flex-wrap">
        {!draft.pay.trim() && state.standardPay && (
          <button
            type="button"
            onClick={() => setDraft((d) => (d ? { ...d, pay: state.standardPay } : d))}
            className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
          >
            Start from the standard text
          </button>
        )}
        {draft.pay.trim() && (
          <button
            type="button"
            onClick={() => setDraft((d) => (d ? { ...d, pay: '' } : d))}
            className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
          >
            Reset to standard
          </button>
        )}
      </div>
      {error && <p className="text-data-caption-13 text-accent-red">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="text-data-caption-13 text-surface-ink/60 hover:text-accent-red underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-data-caption-13 text-surface-ink/60">Markdown is supported.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom admin card: recipients (band emails + payout handles), the engineer's
// email, additional recipients, and links to the Settings editors.
// ---------------------------------------------------------------------------

export function HubAdminRecipients({ state }: { state: ShowAdvanceState }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extraEmails, setExtraEmails] = useState<string[]>(state.extraEmails);
  const [savingExtras, setSavingExtras] = useState(false);

  const extrasDirty = JSON.stringify(extraEmails) !== JSON.stringify(state.extraEmails);

  async function saveExtras() {
    setSavingExtras(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extraEmails }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      setNotice('Additional recipients saved.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingExtras(false);
    }
  }

  return (
    <section className="border border-accent-red p-5 space-y-5 bg-surface-paper-shade">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AdminTag />
          <h2 className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase">
            Recipients &amp; contacts
          </h2>
        </div>
        <span className="text-data-caption-13 text-surface-ink/60">Only you can see this section.</span>
      </div>

      {error && (
        <div className="border border-accent-red text-accent-red text-body-3 px-3 py-1.5">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-surface-ink text-surface-ink text-body-3 px-3 py-1.5">
          {notice}
        </div>
      )}

      {/* Band and engineer contacts are read-only here: they're edited in one
          place, the show's Crew tab (they save to each person's profile). */}
      <ul className="space-y-2 text-body-3">
        {state.recipients.map((r) => (
          <ContactLine key={r.bandId} name={r.name} email={r.email} payout={r.paymentMethod} />
        ))}
        {state.recipients.length === 0 && (
          <li className="text-surface-ink/60">No bands on this show yet.</li>
        )}
      </ul>

      <div className="space-y-2 border-t border-surface-ink/20 pt-4">
        <p className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">Sound engineer</p>
        {state.soundEngineer ? (
          <ul className="text-body-3">
            <ContactLine name={state.soundEngineer.name} email={state.soundEngineer.email} />
          </ul>
        ) : (
          <p className="text-body-3 text-surface-ink/60">
            No confirmed sound engineer on this show — confirm one on the Crew tab to loop them in.
          </p>
        )}
      </div>

      <p className="text-data-caption-13 text-surface-ink/60 -mt-1">
        Emails and payout handles are edited on the{' '}
        <Link
          href={`/admin/shows/${state.showId}/lineup`}
          className="underline decoration-dotted underline-offset-2 hover:text-accent-red"
        >
          Crew tab
        </Link>
        {' '}— they save to each person&rsquo;s profile, used on the settlement and every future show.
      </p>

      <div className="space-y-2 border-t border-surface-ink/20 pt-4">
        <p className="text-data-overline-11 font-bold leading-[1.3] tracking-[--spacing(0.625)] uppercase text-surface-ink/60">
          Additional recipients
        </p>
        {extraEmails.length > 0 && (
          <ul className="space-y-2">
            {extraEmails.map((email, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setExtraEmails((list) => list.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  placeholder="name@example.com"
                  className={`${inputClass} flex-1 min-w-[14rem]`}
                  aria-label={`Additional recipient ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setExtraEmails((list) => list.filter((_, j) => j !== i))}
                  className={buttonClass}
                  aria-label={`Remove additional recipient ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setExtraEmails((list) => [...list, ''])}
            className={buttonClass}
          >
            + Add email
          </button>
          <button
            type="button"
            onClick={saveExtras}
            disabled={savingExtras || !extrasDirty}
            className={buttonClass}
          >
            {savingExtras ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="text-data-caption-13 text-surface-ink/60">
          Promoter, venue, tour manager, … — anyone here gets the invite and every emailed
          message.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap border-t border-surface-ink/20 pt-4 text-data-caption-13">
        <Link href="/admin/settings" className="text-surface-ink/60 hover:text-accent-red underline">
          Edit invite template →
        </Link>
        <Link href="/admin/settings" className="text-surface-ink/60 hover:text-accent-red underline">
          Watchers →
        </Link>
        <Link href="/admin/settings" className="text-surface-ink/60 hover:text-accent-red underline">
          Venue &amp; info text →
        </Link>
      </div>
    </section>
  );
}

// One read-only contact row: name, then email + payout (or a "no email" flag,
// since a missing email means they won't get the invite).
function ContactLine({
  name,
  email,
  payout,
}: {
  name: string;
  email: string | null;
  payout?: string | null;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-surface-ink">{name}</span>
      {email ? (
        <span className="text-surface-ink/60 break-all">{email}</span>
      ) : (
        <span className="text-data-caption-13 font-bold">no email — won&rsquo;t get the invite</span>
      )}
      {payout && <span className="text-surface-ink/60">· {payout}</span>}
    </li>
  );
}
