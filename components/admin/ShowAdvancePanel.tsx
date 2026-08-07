'use client';

import { useState } from 'react';
import Link from 'next/link';
import type {
  ShowAdvanceState,
  SavedAdvanceVars,
  AdvanceRecipient,
  AdvanceThreadMessage,
  AdvanceAttachment,
  ScheduleRow,
} from '@/lib/advance';
import { htmlToText, splitReplyQuote } from '@/lib/reply-text';

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const inputClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#E8E0D0] placeholder:text-[#E8E0D0]/30';

export default function ShowAdvancePanel({
  initial,
}: {
  initial: ShowAdvanceState;
}) {
  const [state, setState] = useState(initial);
  const [vars, setVars] = useState<SavedAdvanceVars>(initial.vars);
  const [savedVars, setSavedVars] = useState<SavedAdvanceVars>(initial.vars);
  // Ad-hoc recipient emails (promoter, venue, tour manager, …), not tied to a
  // band or the engineer. Edited here and persisted with the draft/send.
  const [extraEmails, setExtraEmails] = useState<string[]>(initial.extraEmails);
  const [savedExtraEmails, setSavedExtraEmails] = useState<string[]>(initial.extraEmails);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Local editor for the confirmed engineer's email; kept in sync with server
  // state on refresh. Saved separately (it lives on the engineer, not the vars).
  const [engineerEmail, setEngineerEmail] = useState(initial.soundEngineer?.email ?? '');
  const [savingEngineer, setSavingEngineer] = useState(false);
  // The rendered email is long, so once it's already been sent, collapse it by
  // default — the thread up top is the point at that stage. Still expandable.
  const [showPreview, setShowPreview] = useState(initial.status !== 'sent');

  const engineerDirty = engineerEmail !== (state.soundEngineer?.email ?? '');

  const dirty =
    JSON.stringify(vars) !== JSON.stringify(savedVars) ||
    JSON.stringify(extraEmails) !== JSON.stringify(savedExtraEmails);
  const withEmail = state.recipients.filter((r) => r.email);
  const missingEmail = state.recipients.filter((r) => !r.email);
  // Anything with an @ counts toward sendability; the server does the real
  // validation/normalization on save & send.
  const validExtraEmails = extraEmails.filter((e) => e.includes('@'));
  const canSend = withEmail.length > 0 || validExtraEmails.length > 0;

  function setVar(key: 'sound_engineer' | 'soundcheck_notes', value: string) {
    setVars((v) => ({ ...v, [key]: value }));
  }

  function setSchedule(rows: ScheduleRow[]) {
    setVars((v) => ({ ...v, schedule: rows }));
  }

  function setExtraEmail(index: number, value: string) {
    setExtraEmails((list) => list.map((e, i) => (i === index ? value : e)));
  }

  function addExtraEmail() {
    setExtraEmails((list) => [...list, '']);
  }

  function removeExtraEmail(index: number) {
    setExtraEmails((list) => list.filter((_, i) => i !== index));
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars, extraEmails }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      const next = (await res.json()) as ShowAdvanceState;
      setState(next);
      setVars(next.vars);
      setSavedVars(next.vars);
      setExtraEmails(next.extraEmails);
      setSavedExtraEmails(next.extraEmails);
      setNotice('Draft saved — preview updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`);
      if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
      const next = (await res.json()) as ShowAdvanceState;
      setState(next);
      setEngineerEmail(next.soundEngineer?.email ?? '');
      // Don't clobber unsaved additional-recipient edits (refresh also fires
      // after inline band/engineer saves); only resync when there's nothing
      // pending locally.
      if (JSON.stringify(extraEmails) === JSON.stringify(savedExtraEmails)) {
        setExtraEmails(next.extraEmails);
      }
      setSavedExtraEmails(next.extraEmails);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }

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
      await refresh();
      setNotice('Sound engineer email saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingEngineer(false);
    }
  }

  async function sendReply() {
    if (!replyBody.trim()) return;
    setReplying(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Reply failed (${res.status})`);
      if (d.state) setState(d.state as ShowAdvanceState);
      setReplyBody('');
      setNotice(`Reply sent to ${d.sentCount} band${d.sentCount === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reply failed');
    } finally {
      setReplying(false);
    }
  }

  async function send() {
    const n = withEmail.length;
    const extra = validExtraEmails.length;
    const who =
      `${n} band${n === 1 ? '' : 's'}` +
      (extra ? ` + ${extra} additional recipient${extra === 1 ? '' : 's'}` : '');
    const skip = missingEmail.length
      ? `\n\n${missingEmail.length} band(s) without an email will be skipped: ${missingEmail
          .map((r) => r.name)
          .join(', ')}.`
      : '';
    if (
      !confirm(
        `Send the advance to ${who}${
          state.status === 'sent' ? ' again' : ''
        }?${skip}`
      )
    ) {
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/shows/${state.showId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vars, extraEmails }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) throw new Error(d?.error ?? `Send failed (${res.status})`);
      if (d.state) {
        setState(d.state as ShowAdvanceState);
        setVars((d.state as ShowAdvanceState).vars);
        setSavedVars((d.state as ShowAdvanceState).vars);
        setExtraEmails((d.state as ShowAdvanceState).extraEmails);
        setSavedExtraEmails((d.state as ShowAdvanceState).extraEmails);
      }
      setNotice(
        `Sent to ${d.sentCount} band${d.sentCount === 1 ? '' : 's'}.` +
          (d.skipped?.length ? ` Skipped (no email): ${d.skipped.join(', ')}.` : '')
      );
      // Now that it's out, the thread jumps to the top and the long email
      // preview isn't the focus — collapse it.
      setShowPreview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Advance email</h2>
          {state.status === 'sent' ? (
            <span className="text-xs rounded-full border border-green-400/40 bg-green-400/10 text-green-300 px-2.5 py-0.5">
              Sent{state.sentAt ? ` · ${new Date(state.sentAt).toLocaleDateString()}` : ''}
            </span>
          ) : state.status === 'draft' ? (
            <span className="text-xs rounded-full border border-[#E8E0D0]/30 text-[#E8E0D0]/60 px-2.5 py-0.5">
              Draft
            </span>
          ) : (
            <span className="text-xs rounded-full border border-[#E8E0D0]/20 text-[#E8E0D0]/40 px-2.5 py-0.5">
              Not started
            </span>
          )}
        </div>
        <Link
          href="/admin/settings"
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
        >
          Edit boilerplate template →
        </Link>
      </div>

      {error && (
        <div className="border border-red-400/40 bg-red-400/10 text-red-300 text-sm rounded px-4 py-2">
          {error}
        </div>
      )}
      {notice && (
        <div className="border border-green-400/40 bg-green-400/10 text-green-200 text-sm rounded px-4 py-2">
          {notice}
        </div>
      )}

      {/* Thread — surfaced at the top once the advance is sent, since the
          replies are the main thing you're here for after sending. */}
      {state.status === 'sent' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
              Thread ({state.messages.length})
            </p>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline disabled:opacity-40"
            >
              {refreshing ? 'Refreshing…' : 'Refresh for new replies'}
            </button>
          </div>

          <ul className="space-y-3">
            {state.messages.map((m) => {
              const recipient = state.recipients.find((r) => r.bandId === m.bandId);
              const who =
                m.direction === 'outbound'
                  ? 'You → lineup'
                  : recipient
                    ? `${recipient.name} replied`
                    : m.fromEmail ?? 'Reply';
              return <ThreadMessageItem key={m.id} message={m} who={who} />;
            })}
            {state.messages.length === 0 && (
              <li className="text-sm text-[#E8E0D0]/40">No messages yet.</li>
            )}
          </ul>

          {/* Reply on the thread */}
          <div className="space-y-2 border-t border-[#E8E0D0]/10 pt-3">
            <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
              Reply to the lineup
            </label>
            <textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              rows={4}
              placeholder="Sounds good — see you Saturday!"
              className={`${inputClass} w-full resize-y`}
            />
            <button
              type="button"
              onClick={sendReply}
              disabled={replying || !replyBody.trim()}
              className="border border-[#E8E0D0]/40 rounded px-4 py-2 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
            >
              {replying ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </div>
      )}

      {/* Recipients */}
      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-3">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
          Recipients ({withEmail.length} of {state.recipients.length} with an email)
        </p>
        <ul className="space-y-3 text-sm">
          {state.recipients.map((r) => (
            // Key on the saved values so a successful inline save (which changes
            // them via refresh) remounts the row with fresh, un-dirty state.
            <RecipientRow
              key={`${r.bandId}:${r.email ?? ''}:${r.paymentMethod ?? ''}`}
              recipient={r}
              showId={state.showId}
              onSaved={async (msg) => {
                await refresh();
                setNotice(msg);
                setError(null);
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
      </div>

      {/* Sound engineer — looped onto the advance as a recipient (and forwarded
          band replies), so they need a contact email. */}
      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">Sound engineer</p>
        {state.soundEngineer ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#E8E0D0]">{state.soundEngineer.name}</span>
              <input
                type="email"
                value={engineerEmail}
                onChange={(e) => setEngineerEmail(e.target.value)}
                placeholder="email — they'll be added to the advance"
                className={`${inputClass} flex-1 min-w-[14rem]`}
                aria-label="Sound engineer email"
              />
              <button
                type="button"
                onClick={saveEngineerEmail}
                disabled={savingEngineer || !engineerDirty}
                className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
              >
                {savingEngineer ? 'Saving…' : 'Save'}
              </button>
            </div>
            {!engineerEmail.trim() && (
              <p className="text-xs text-amber-300/80">
                Add an email so {state.soundEngineer.name} gets the advance and band replies.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-[#E8E0D0]/40">
            No confirmed sound engineer on this show — confirm one on the show form to loop them in.
          </p>
        )}
      </div>

      {/* Additional recipients — ad-hoc emails not tied to a band or the
          engineer (promoter, venue, tour manager, …). Saved with the draft and
          included on every send / reply. */}
      <div className="border border-[#E8E0D0]/15 rounded-lg p-4 space-y-3">
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
                  onChange={(e) => setExtraEmail(i, e.target.value)}
                  placeholder="name@example.com"
                  className={`${inputClass} flex-1 min-w-[14rem]`}
                  aria-label={`Additional recipient ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() => removeExtraEmail(i)}
                  className="border border-[#E8E0D0]/40 rounded px-3 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
                  aria-label={`Remove additional recipient ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addExtraEmail}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors"
        >
          + Add email
        </button>
        <p className="text-xs text-[#E8E0D0]/40">
          Anyone here gets the advance and any thread replies. Saved with the draft below.
        </p>
      </div>

      {/* Per-show fields */}
      <div className="space-y-4">
        <Field
          label="Sound engineer"
          hint={
            state.show.soundEngineerName
              ? `Defaults to ${state.show.soundEngineerName} (confirmed on this show)`
              : 'No confirmed engineer on this show yet'
          }
        >
          <input
            value={vars.sound_engineer}
            onChange={(e) => setVar('sound_engineer', e.target.value)}
            placeholder={state.show.soundEngineerName || 'Name'}
            className={`${inputClass} w-full`}
          />
        </Field>

        <Field
          label="Schedule"
          hint="One row per moment: a time (or range, e.g. 8–8:30pm) and what's happening. Renders as the highlighted schedule box."
        >
          <ScheduleEditor
            rows={vars.schedule}
            bandNames={state.recipients.map((r) => r.name)}
            onChange={setSchedule}
          />
        </Field>

        <Field
          label="Soundcheck notes"
          hint="Optional — the extra note about linechecks / order (was highlighted in blue)."
        >
          <textarea
            value={vars.soundcheck_notes}
            onChange={(e) => setVar('soundcheck_notes', e.target.value)}
            rows={3}
            className={`${inputClass} w-full resize-y`}
          />
        </Field>

        <div className="text-xs text-[#E8E0D0]/40 border border-[#E8E0D0]/10 rounded p-3 space-y-0.5">
          <p>Auto-filled from the show:</p>
          <p>
            <span className="text-[#E8E0D0]/60">Lineup:</span>{' '}
            {state.recipients.map((r) => r.name).join(', ') || '—'}
          </p>
          <p>
            <span className="text-[#E8E0D0]/60">Date:</span> {state.show.date ?? '—'}
          </p>
          <p>
            <span className="text-[#E8E0D0]/60">Show link:</span> /shows/{state.show.slug}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving || !dirty}
          className="border border-[#E8E0D0]/40 rounded px-4 py-2 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save draft & refresh preview'}
        </button>
        <button
          type="button"
          onClick={send}
          disabled={sending || !canSend}
          className="bg-[#E8E0D0] text-[#2A2420] border border-[#E8E0D0] rounded px-6 py-2 text-sm font-medium hover:bg-[#E8E0D0]/90 transition-colors disabled:opacity-50"
        >
          {sending
            ? 'Sending…'
            : state.status === 'sent'
              ? 'Resend to lineup'
              : 'Send to lineup'}
        </button>
        {!canSend && (
          <span className="text-xs text-amber-300/80">
            Add a contact email to at least one band — or an additional recipient — to send.
          </span>
        )}
        {dirty && (
          <span className="text-xs text-[#E8E0D0]/40">
            Unsaved edits — save to update the preview below.
          </span>
        )}
      </div>

      {/* Preview — collapsible; the rendered email is long, so it can be tucked
          away (and starts collapsed once the advance has been sent). */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-[#E8E0D0]/60">
            {state.status === 'sent' ? 'Sent email' : 'Preview'}
            {dirty ? ' (reflects last saved draft)' : ''}
          </p>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline"
          >
            {showPreview ? 'Hide' : 'Show'}
          </button>
        </div>
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
    </div>
  );
}

// One band in the recipients list: shows the contact email (or a link to add
// one on the band page) and an inline-editable payout handle (Venmo, etc.) so
// it's captured while advancing and on hand at settlement. The handle saves to
// the band via the same PATCH the band edit form uses; it's admin-only and
// never leaves the Birdhaus admin.
function RecipientRow({
  recipient,
  showId,
  onSaved,
  onError,
}: {
  recipient: AdvanceRecipient;
  showId: number;
  onSaved: (notice: string) => void | Promise<void>;
  onError: (error: string) => void;
}) {
  const [email, setEmail] = useState(recipient.email ?? '');
  const [venmo, setVenmo] = useState(recipient.paymentMethod ?? '');
  const [saving, setSaving] = useState(false);
  const emailDirty = email.trim() !== (recipient.email ?? '');
  const venmoDirty = venmo.trim() !== (recipient.paymentMethod ?? '');
  const dirty = emailDirty || venmoDirty;

  async function save() {
    setSaving(true);
    try {
      // Only send the fields that actually changed so a blank untouched field
      // never clears the other value.
      const payload: { contactEmail?: string; paymentMethod?: string } = {};
      if (emailDirty) payload.contactEmail = email;
      if (venmoDirty) payload.paymentMethod = venmo;
      const res = await fetch(`/api/admin/bands/${recipient.bandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error ?? `Save failed (${res.status})`);
      }
      await onSaved(`Saved ${recipient.name}'s contact details.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="space-y-1.5">
      <span className="text-[#E8E0D0]">{recipient.name}</span>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contact email — they'll get the advance"
          className={`${inputClass} flex-1 min-w-[14rem]`}
          aria-label={`${recipient.name} contact email`}
        />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={venmo}
          onChange={(e) => setVenmo(e.target.value)}
          placeholder="Venmo / payout handle (private)"
          className={`${inputClass} flex-1 min-w-[14rem]`}
          aria-label={`${recipient.name} payout handle`}
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="border border-[#E8E0D0]/40 rounded px-4 py-1.5 text-sm hover:bg-[#E8E0D0]/10 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </li>
  );
}

function ThreadMessageItem({
  message,
  who,
}: {
  message: AdvanceThreadMessage;
  who: string;
}) {
  const [showQuote, setShowQuote] = useState(false);
  // Prefer the text/plain part; fall back to a text rendering of the HTML part
  // (rendered as text, never injected as HTML — the sender is external). Then
  // peel off the quoted advance so the new message reads clean.
  const raw = message.bodyText ?? (message.bodyHtml ? htmlToText(message.bodyHtml) : null);
  const { body, quoted } = raw ? splitReplyQuote(raw) : { body: '', quoted: '' };

  return (
    <li
      className={`rounded-lg border px-4 py-3 text-sm ${
        message.direction === 'inbound'
          ? 'border-[#E8E0D0]/25 bg-[#E8E0D0]/[0.04]'
          : 'border-[#E8E0D0]/15'
      }`}
    >
      <div className="flex items-center justify-between text-xs text-[#E8E0D0]/50">
        <span className={message.direction === 'inbound' ? 'text-[#E8E0D0]/80' : ''}>
          {who}
        </span>
        <span>{new Date(message.createdAt).toLocaleString()}</span>
      </div>
      {body ? (
        <div className="mt-1.5 whitespace-pre-wrap text-[#E8E0D0]/75">{body}</div>
      ) : (
        <div className="mt-1.5 text-[#E8E0D0]/40 italic">
          {quoted ? '(no new text above the quoted message)' : '(no message content)'}
        </div>
      )}
      {message.attachments.length > 0 && (
        <div className="mt-3 space-y-2">
          {message.attachments.map((a) => (
            <AttachmentItem key={a.id} attachment={a} />
          ))}
        </div>
      )}
      {quoted && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowQuote((v) => !v)}
            className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0]/80 underline"
          >
            {showQuote ? 'Hide quoted text' : 'Show quoted text'}
          </button>
          {showQuote && (
            <div className="mt-1.5 whitespace-pre-wrap border-l-2 border-[#E8E0D0]/15 pl-3 text-xs text-[#E8E0D0]/40">
              {quoted}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function AttachmentItem({ attachment }: { attachment: AdvanceAttachment }) {
  const [open, setOpen] = useState(false);
  const type = attachment.contentType ?? '';
  const isPdf = type === 'application/pdf';
  const isImage = type.startsWith('image/');
  const previewable = isPdf || isImage;
  const name = attachment.filename || (isPdf ? 'attachment.pdf' : 'attachment');
  const meta = [isPdf ? 'PDF' : type || 'file', formatBytes(attachment.sizeBytes)]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded-md border border-[#E8E0D0]/20 bg-[#E8E0D0]/[0.03]">
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden className="text-[#E8E0D0]/60">
          {isPdf ? '📄' : isImage ? '🖼️' : '📎'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-[#E8E0D0]/90">{name}</div>
          {meta && <div className="text-xs text-[#E8E0D0]/40">{meta}</div>}
        </div>
        {previewable && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline shrink-0"
          >
            {open ? 'Hide' : 'Preview'}
          </button>
        )}
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#E8E0D0]/50 hover:text-[#E8E0D0] underline shrink-0"
        >
          Open ↗
        </a>
      </div>
      {open && previewable && (
        <div className="border-t border-[#E8E0D0]/10 bg-white/[0.02] p-2">
          {isPdf ? (
            <iframe
              src={attachment.url}
              title={name}
              className="h-[70vh] w-full rounded bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.url}
              alt={name}
              className="max-h-[70vh] w-auto max-w-full rounded"
            />
          )}
        </div>
      )}
    </div>
  );
}

// Time entry for a schedule row. The stored value stays a plain string (e.g.
// "7:30pm", "8–8:30pm") so the email render and legacy drafts are unchanged —
// this just drives it with dropdowns. PM is assumed (no AM control; we've never
// had an AM schedule), so the string always carries a "pm" suffix. An optional
// end time turns a single time into a range.
const HOURS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const timeSelectClass =
  'bg-transparent border border-[#E8E0D0]/30 rounded px-1 py-1 text-sm focus:outline-none focus:border-[#E8E0D0] [&>option]:bg-[#2A2420]';

interface ParsedTime {
  startH: number | null;
  startM: number;
  endH: number | null;
  endM: number;
}

const EMPTY_TIME: ParsedTime = { startH: null, startM: 0, endH: null, endM: 0 };

// Parse a stored time string ("7:30pm", "8–8:30", "5:30 pm") into structured
// fields. Meridiem text is ignored (PM assumed). Anything unparseable → empty.
function parseTime(value: string): ParsedTime {
  // Strip meridiem (no \b — "pm" sits against a digit, e.g. "8pm", so a word
  // boundary never matches there) and all whitespace.
  const cleaned = value.toLowerCase().replace(/am|pm/g, '').replace(/\s+/g, '');
  if (!cleaned) return EMPTY_TIME;
  const parts = cleaned.split(/–|—|-|to/);
  const parsePart = (p: string): { h: number; m: number } | null => {
    const m = p.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h < 1 || h > 12 || min > 59) return null;
    return { h, m: min };
  };
  const start = parsePart(parts[0] ?? '');
  if (!start) return EMPTY_TIME;
  const end = parts[1] ? parsePart(parts[1]) : null;
  return { startH: start.h, startM: start.m, endH: end ? end.h : null, endM: end ? end.m : 0 };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Format structured fields back to the stored string. On-the-hour times drop
// ":00" ("8" not "8:00"), matching how these usually read; "pm" is appended.
function formatTime(t: ParsedTime): string {
  if (t.startH === null) return '';
  const part = (h: number, m: number) => (m ? `${h}:${pad2(m)}` : `${h}`);
  let s = part(t.startH, t.startM);
  if (t.endH !== null) s += `–${part(t.endH, t.endM)}`;
  return `${s}pm`;
}

function TimeSelects({
  hour,
  minute,
  allowEmpty,
  onHour,
  onMinute,
}: {
  hour: number | null;
  minute: number;
  allowEmpty: boolean;
  onHour: (h: number | null) => void;
  onMinute: (m: number) => void;
}) {
  // Keep an off-grid minute (e.g. a legacy "8:20" — actually on-grid, but guard
  // anyway) selectable rather than silently dropping to the first option.
  const minuteOptions = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);
  return (
    <span className="inline-flex items-center">
      <select
        value={hour ?? ''}
        onChange={(e) => onHour(e.target.value === '' ? null : Number(e.target.value))}
        className={timeSelectClass}
        aria-label="Hour"
      >
        {allowEmpty && <option value="">–</option>}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-[#E8E0D0]/30 px-0.5">:</span>
      <select
        value={minute}
        onChange={(e) => onMinute(Number(e.target.value))}
        disabled={hour === null}
        className={`${timeSelectClass} disabled:opacity-40`}
        aria-label="Minute"
      >
        {minuteOptions.map((m) => (
          <option key={m} value={m}>
            {pad2(m)}
          </option>
        ))}
      </select>
    </span>
  );
}

function TimeField({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const t = parseTime(value);
  const emit = (next: Partial<ParsedTime>) => onChange(formatTime({ ...t, ...next }));

  return (
    <div className="flex items-center gap-1 shrink-0">
      <TimeSelects
        hour={t.startH}
        minute={t.startM}
        allowEmpty
        // Clearing the start hour clears the whole time (and any range).
        onHour={(h) => (h === null ? onChange('') : emit({ startH: h }))}
        onMinute={(m) => emit({ startM: m })}
      />
      {t.endH !== null ? (
        <>
          <span className="text-[#E8E0D0]/30 text-xs">–</span>
          <TimeSelects
            hour={t.endH}
            minute={t.endM}
            allowEmpty={false}
            onHour={(h) => emit({ endH: h })}
            onMinute={(m) => emit({ endM: m })}
          />
          <button
            type="button"
            onClick={() => emit({ endH: null, endM: 0 })}
            className="text-[#E8E0D0]/40 hover:text-red-300 text-xs px-0.5"
            aria-label="Remove end time"
          >
            ✕
          </button>
        </>
      ) : (
        t.startH !== null && (
          <button
            type="button"
            onClick={() => emit({ endH: t.startH, endM: t.startM })}
            className="text-xs text-[#E8E0D0]/40 hover:text-[#E8E0D0] whitespace-nowrap"
          >
            +range
          </button>
        )
      )}
      <span className="text-[10px] text-[#E8E0D0]/30">pm</span>
    </div>
  );
}

// Default schedule template, derived so it reproduces the standard Birdhaus
// timing exactly for a 3-band show and scales for any lineup size:
//   4:00pm  sound engineer arrives / load-in
//   4:30pm  soundchecks, 1 hr apart, in REVERSE set order (headliner first)
//   +30min  doors, after the last soundcheck
//   +1hr    first set after doors; 35-min sets with 15-min changeovers
//   +45min  house clear, after the last set
// All PM. Uses formatTime so the strings round-trip through the time picker.
function buildScheduleTemplate(bandNames: string[]): ScheduleRow[] {
  const clean = bandNames.map((n) => n.trim()).filter(Boolean);
  const n = clean.length;

  // Minutes-from-midnight → the picker's PM parts (hour 1–12, minute).
  const parts = (min: number) => {
    const h24 = Math.floor(min / 60);
    return { h: h24 > 12 ? h24 - 12 : h24, m: min % 60 };
  };
  const at = (min: number) => {
    const { h, m } = parts(min);
    return formatTime({ startH: h, startM: m, endH: null, endM: 0 });
  };
  const range = (start: number, end: number) => {
    const a = parts(start);
    const b = parts(end);
    return formatTime({ startH: a.h, startM: a.m, endH: b.h, endM: b.m });
  };

  const rows: ScheduleRow[] = [];
  rows.push({ time: at(16 * 60), label: 'Sound engineer arrives — bands can start loading in' });

  // Soundchecks in reverse set order (headliner first), 1 hr apart from 4:30pm.
  const scStart = 16 * 60 + 30;
  [...clean].reverse().forEach((name, i) => {
    rows.push({ time: at(scStart + i * 60), label: `${name} soundcheck` });
  });

  const doors = scStart + Math.max(n - 1, 0) * 60 + 30; // 30 min after last soundcheck
  rows.push({ time: at(doors), label: 'Doors' });

  // Sets in set order from doors + 1 hr: 35-min sets, 15-min changeovers.
  const setStart = doors + 60;
  const setStep = 50; // 35-min set + 15-min changeover
  clean.forEach((name, i) => {
    const s = setStart + i * setStep;
    rows.push({ time: range(s, s + 35), label: name });
  });

  const lastSetEnd = setStart + Math.max(n - 1, 0) * setStep + 35;
  rows.push({ time: at(lastSetEnd + 45), label: 'House clear' });

  return rows;
}

// Structured schedule: an ordered list of {time, label} rows. Renders (via
// formatScheduleBlock) as the highlighted schedule box in the email. "Prefill
// from lineup" scaffolds the standard show timing (see buildScheduleTemplate) —
// load-in, soundchecks, doors, sets, and house clear, with times filled in.
function ScheduleEditor({
  rows,
  bandNames,
  onChange,
}: {
  rows: ScheduleRow[];
  bandNames: string[];
  onChange: (rows: ScheduleRow[]) => void;
}) {
  function update(i: number, patch: Partial<ScheduleRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    onChange([...rows, { time: '', label: '' }]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  function prefill() {
    const hasContent = rows.some((r) => r.time.trim() || r.label.trim());
    if (hasContent && !confirm('Replace the current schedule with a lineup template?')) return;
    onChange(buildScheduleTemplate(bandNames));
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <TimeField value={row.time} onChange={(t) => update(i, { time: t })} />
              <span className="text-[#E8E0D0]/30 text-sm shrink-0">—</span>
              <input
                value={row.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="what's happening"
                className={`${inputClass} flex-1 min-w-[8rem]`}
                aria-label="Description"
              />
              <div className="flex items-center shrink-0 text-[#E8E0D0]/40">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="px-1 hover:text-[#E8E0D0] disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === rows.length - 1}
                  className="px-1 hover:text-[#E8E0D0] disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="px-1 hover:text-red-300"
                  aria-label="Remove row"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          className="text-sm text-[#E8E0D0]/55 hover:text-[#E8E0D0] border border-[#E8E0D0]/25 rounded px-3 py-1.5 transition-colors"
        >
          + Add row
        </button>
        {bandNames.length > 0 && (
          <button
            type="button"
            onClick={prefill}
            className="text-xs text-[#E8E0D0]/45 hover:text-[#E8E0D0] underline"
          >
            Prefill from lineup
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs uppercase tracking-wide text-[#E8E0D0]/60">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[#E8E0D0]/35">{hint}</p>}
    </div>
  );
}
