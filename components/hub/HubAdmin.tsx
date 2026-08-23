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
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

const buttonClass =
  'border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-xs hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40';

function AdminTag() {
  return (
    <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[#c8a26a] border border-[#c8a26a]/40 rounded px-1.5 py-0.5">
      admin
    </span>
  );
}

// ---------------------------------------------------------------------------
// Top bar: invite status + send, link copy, back to the show in the admin.
// ---------------------------------------------------------------------------

export function HubAdminBar({ state }: { state: ShowAdvanceState }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const withEmail = state.recipients.filter((r) => r.email);
  const missingEmail = state.recipients.filter((r) => !r.email);
  const canSend = withEmail.length > 0 || state.extraEmails.length > 0;

  async function sendInvite() {
    const n = withEmail.length;
    const extra = state.extraEmails.length;
    const who =
      `${n} band${n === 1 ? '' : 's'}` +
      (state.soundEngineer?.email ? ' + sound engineer' : '') +
      (extra ? ` + ${extra} additional recipient${extra === 1 ? '' : 's'}` : '');
    const skip = missingEmail.length
      ? `\n\n${missingEmail.length} band(s) without an email will be skipped: ${missingEmail
          .map((r) => r.name)
          .join(', ')}.`
      : '';
    if (
      !confirm(
        `Send the portal invite email to ${who}${state.status === 'sent' ? ' again' : ''}?${skip}`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      // Empty body: the server keeps the saved show info as-is and just sends.
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Send failed (${res.status})`);
      setNotice(
        `Invite sent to ${d.sentCount} recipient${d.sentCount === 1 ? '' : 's'}.` +
          (d.skipped?.length ? ` Skipped (no email): ${d.skipped.join(', ')}.` : '')
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

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
    <div className="rounded-xl border border-[#c8a26a]/35 bg-[#c8a26a]/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <AdminTag />
          {state.status === 'sent' ? (
            <span className="text-xs rounded-full border border-green-400/40 bg-green-400/10 text-green-300 px-2.5 py-0.5">
              Invite sent
              {state.sentAt ? ` · ${new Date(state.sentAt).toLocaleDateString()}` : ''}
            </span>
          ) : (
            <span className="text-xs rounded-full border border-[#E8E0D0]/25 text-[#E8E0D0]/55 px-2.5 py-0.5">
              Invite not sent yet
            </span>
          )}
          <span className="text-xs text-[#E8E0D0]/50">
            {withEmail.length} of {state.recipients.length} bands have an email
          </span>
        </div>
        <Link
          href={`/admin/shows/${state.showId}`}
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
        >
          Show admin →
        </Link>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          onClick={sendInvite}
          disabled={sending || !canSend}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-4 py-1.5 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {sending
            ? 'Sending…'
            : state.status === 'sent'
              ? 'Resend invite email'
              : 'Send invite email'}
        </button>
        <button type="button" onClick={() => setShowPreview((v) => !v)} className={buttonClass}>
          {showPreview ? 'Hide invite preview' : 'Preview invite'}
        </button>
        <button type="button" onClick={copyLink} className={buttonClass}>
          {copied ? 'Copied!' : 'Copy portal link'}
        </button>
        {!canSend && (
          <span className="text-xs text-amber-300/80">
            No recipients have an email yet — add them in the admin section at the bottom.
          </span>
        )}
      </div>
      <p className="text-xs text-[#E8E0D0]/45">
        The invite is a short email pointing everyone here. This page IS the portal — what you
        see below is what bands see, plus the admin edit controls.
      </p>
      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-3 py-1.5">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-green-400/40 bg-green-400/10 text-green-200 text-sm rounded px-3 py-1.5">
          {notice}
        </div>
      )}
      {showPreview && (
        <div className="rounded-lg border border-[#E8E0D0]/15 overflow-hidden">
          <div className="border-b border-[#E8E0D0]/10 px-4 py-2 text-sm text-[#E8E0D0]/70">
            <span className="text-[#E8E0D0]/40">Subject:</span> {state.preview.subject}
          </div>
          <div
            className="bg-[#f6f2e9] text-[#2A2420] px-6 py-5 text-sm leading-relaxed advance-preview"
            dangerouslySetInnerHTML={{ __html: state.preview.html }}
          />
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

// Inline editor under the Schedule card: schedule rows + soundcheck notes +
// the engineer name shown in the header.
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
        <AdminTag />
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
    <div className="space-y-3 rounded-lg border border-[#c8a26a]/35 bg-[#c8a26a]/[0.05] p-4">
      <div className="flex items-center gap-2">
        <AdminTag />
        <span className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Edit schedule &amp; notes
        </span>
      </div>
      <ScheduleEditor
        rows={draft.schedule}
        bandNames={bandNames}
        onChange={(rows) => setDraft((d) => (d ? { ...d, schedule: rows } : d))}
      />
      <div className="space-y-1">
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Soundcheck notes
        </label>
        <textarea
          value={draft.soundcheck_notes}
          onChange={(e) =>
            setDraft((d) => (d ? { ...d, soundcheck_notes: e.target.value } : d))
          }
          rows={3}
          placeholder="Optional — linecheck order, early arrivals, etc. Shown here and highlighted in the invite email."
          className={`${inputClass} w-full resize-y`}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
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
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
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
          <span className="text-xs text-amber-300/80">Overridden for this show.</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[#c8a26a]/35 bg-[#c8a26a]/[0.05] p-4">
      <div className="flex items-center gap-2">
        <AdminTag />
        <span className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
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
            className="text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline"
          >
            Start from the standard text
          </button>
        )}
        {draft.pay.trim() && (
          <button
            type="button"
            onClick={() => setDraft((d) => (d ? { ...d, pay: '' } : d))}
            className="text-xs text-[#E8E0D0]/60 hover:text-[#E8E0D0] underline"
          >
            Reset to standard
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-[#E8E0D0]/40">Markdown is supported.</p>
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
  const [engineerEmail, setEngineerEmail] = useState(state.soundEngineer?.email ?? '');
  const [savingEngineer, setSavingEngineer] = useState(false);
  const [extraEmails, setExtraEmails] = useState<string[]>(state.extraEmails);
  const [savingExtras, setSavingExtras] = useState(false);

  const engineerDirty = engineerEmail !== (state.soundEngineer?.email ?? '');
  const extrasDirty = JSON.stringify(extraEmails) !== JSON.stringify(state.extraEmails);

  async function saveEngineerEmail() {
    if (!state.soundEngineer) return;
    setSavingEngineer(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/sound-engineers/${state.soundEngineer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: engineerEmail }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      setNotice('Sound engineer email saved.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingEngineer(false);
    }
  }

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
    <section className="border border-[#c8a26a]/35 rounded-xl p-5 space-y-5 bg-[#c8a26a]/[0.04]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AdminTag />
          <h2 className="text-xs uppercase tracking-[0.12em] text-[#c8a26a] font-semibold">
            Recipients &amp; contacts
          </h2>
        </div>
        <span className="text-xs text-[#E8E0D0]/45">Only you can see this section.</span>
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-3 py-1.5">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-green-400/40 bg-green-400/10 text-green-200 text-sm rounded px-3 py-1.5">
          {notice}
        </div>
      )}

      <ul className="space-y-3 text-sm">
        {state.recipients.map((r) => (
          // Key on the saved values so a successful save (which changes them via
          // refresh) remounts the row with fresh, un-dirty state.
          <BandContactRow
            key={`${r.bandId}:${r.email ?? ''}:${r.paymentMethod ?? ''}`}
            bandId={r.bandId}
            name={r.name}
            email={r.email}
            paymentMethod={r.paymentMethod}
            onSaved={(msg) => {
              setNotice(msg);
              setError(null);
              router.refresh();
            }}
            onError={(msg) => {
              setError(msg);
              setNotice(null);
            }}
          />
        ))}
        {state.recipients.length === 0 && (
          <li className="text-[#E8E0D0]/40">No bands on this show yet.</li>
        )}
      </ul>

      <div className="space-y-2 border-t border-[#E8E0D0]/10 pt-4">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">Sound engineer</p>
        {state.soundEngineer ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[#E8E0D0]">{state.soundEngineer.name}</span>
            <input
              type="email"
              value={engineerEmail}
              onChange={(e) => setEngineerEmail(e.target.value)}
              placeholder="email — they'll get the invite + thread"
              className={`${inputClass} flex-1 min-w-[14rem]`}
              aria-label="Sound engineer email"
            />
            <button
              type="button"
              onClick={saveEngineerEmail}
              disabled={savingEngineer || !engineerDirty}
              className={buttonClass}
            >
              {savingEngineer ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-[#E8E0D0]/40">
            No confirmed sound engineer on this show — confirm one on the show form to loop them
            in.
          </p>
        )}
      </div>

      <div className="space-y-2 border-t border-[#E8E0D0]/10 pt-4">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
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
        <p className="text-xs text-[#E8E0D0]/40">
          Promoter, venue, tour manager, … — anyone here gets the invite and every emailed
          message.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap border-t border-[#E8E0D0]/10 pt-4 text-xs">
        <Link href="/admin/settings" className="text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
          Edit invite template →
        </Link>
        <Link href="/admin/settings" className="text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
          Watchers →
        </Link>
        <Link href="/admin/settings" className="text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline">
          Venue &amp; info text →
        </Link>
      </div>
    </section>
  );
}

function BandContactRow({
  bandId,
  name,
  email: initialEmail,
  paymentMethod,
  onSaved,
  onError,
}: {
  bandId: number;
  name: string;
  email: string | null;
  paymentMethod: string | null;
  onSaved: (notice: string) => void;
  onError: (error: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [venmo, setVenmo] = useState(paymentMethod ?? '');
  const [saving, setSaving] = useState(false);
  const emailDirty = email.trim() !== (initialEmail ?? '');
  const venmoDirty = venmo.trim() !== (paymentMethod ?? '');
  const dirty = emailDirty || venmoDirty;

  async function save() {
    setSaving(true);
    try {
      // Only send the fields that actually changed so a blank untouched field
      // never clears the other value.
      const payload: { contactEmail?: string; paymentMethod?: string } = {};
      if (emailDirty) payload.contactEmail = email;
      if (venmoDirty) payload.paymentMethod = venmo;
      const res = await fetch(`/api/admin/bands/${bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      onSaved(`Saved ${name}'s contact details.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-1.5">
      <span className="text-[#E8E0D0]">{name}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact email — they'll get the invite"
          className={`${inputClass} flex-1 min-w-[14rem]`}
          aria-label={`${name} contact email`}
        />
        <input
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          placeholder="Venmo / payout handle (private)"
          className={`${inputClass} flex-1 min-w-[12rem]`}
          aria-label={`${name} payout handle`}
        />
        <button type="button" onClick={save} disabled={saving || !dirty} className={buttonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </li>
  );
}
